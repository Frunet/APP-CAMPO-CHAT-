import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { esError, resolver } from "./resolver";

/**
 * Diario de novedades por finca: avances, incidencias y avisos que no son un parte, un gasto ni una tarea
 * («el anillado está terminado en Fortaleza»). Compartido con quien ve la finca. El asistente solo PROPONE anotar o retirar; se confirma con un botón.
 */
type Db = SupabaseClient;
type Ctx = { db: Db; userId: string; conversacionId: string };
const fechaZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "debe ser una fecha YYYY-MM-DD");
const dmy = (s: string) => s.split("-").reverse().join("/");

export const herramientasDiario: Anthropic.Tool[] = [
  {
    name: "proponer_novedad",
    description:
      "Prepara (NO guarda) una anotación en el DIARIO DE LA FINCA, visible para todos los usuarios de esa finca: un avance, una incidencia o un aviso que NO sea un parte de trabajo, un gasto, una cosecha ni una tarea " +
      "(p. ej. «el anillado está terminado», «falta agua en la parcela 3», «se ha roto el motor del pozo»). Si es una tarea terminada o por hacer, usa las herramientas de tareas. " +
      "Redáctala en una frase clara y autosuficiente (sin «hoy» ni «ayer»: pon la fecha en el campo fecha). Pide la finca si no la dan. No anotes contraseñas ni datos personales.",
    input_schema: {
      type: "object",
      properties: {
        finca: { type: "string" }, parcela: { type: "string" },
        texto: { type: "string", description: "La novedad, clara y completa (máx. 1000 caracteres)" },
        tema: { type: "string", description: "Palabra clave del asunto, p. ej. «anillado», «riego», «poda»" },
        tipo: { type: "string", enum: ["avance", "incidencia", "aviso", "otro"] },
        fecha: { type: "string", description: "YYYY-MM-DD; por defecto hoy" },
      },
      required: ["finca", "texto"],
    },
  },
  {
    name: "buscar_diario",
    description:
      "Busca en el diario de novedades de las fincas del usuario. Úsala SIEMPRE que pregunten cómo va o en qué estado está un trabajo, qué ha pasado en una finca o qué se ha dicho de un asunto " +
      "(además de buscar_tareas y buscar_registros si procede). Devuelve las más recientes primero, con fecha, finca y quién la anotó. Si hay varias del mismo tema, manda la más reciente; indica fecha y autor.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "palabra del asunto, p. ej. anillado" }, finca: { type: "string" },
        desde: { type: "string" }, hasta: { type: "string" }, limite: { type: "number" },
      },
    },
  },
  {
    name: "proponer_retirar_novedad",
    description: "Prepara (NO guarda) retirar una anotación del diario que es errónea o ya no vale (queda en el historial). Usa el número que da buscar_diario (D12 → 12). El encargado solo puede retirar las suyas.",
    input_schema: { type: "object", properties: { numero: { type: "number" } }, required: ["numero"] },
  },
];

async function rolDe(db: Db, userId: string) {
  const { data } = await db.from("profiles").select("rol").eq("id", userId).maybeSingle();
  return data?.rol as string | undefined;
}
async function guardar(ctx: Ctx, tipo: string, payload: unknown, resumen: string) {
  const { data, error } = await ctx.db.from("acciones_pendientes").insert({ conversacion_id: ctx.conversacionId, user_id: ctx.userId, tipo, payload, resumen }).select("id").single();
  if (error) return { error: error.message };
  return { accion_id: data.id, tipo, resumen, instruccion: "Propuesta creada y NO guardada todavía. Muestra el resumen y di que debe confirmarla con el botón." };
}

export async function proponerNovedad(i: any, ctx: Ctx): Promise<unknown> {
  const rol = await rolDe(ctx.db, ctx.userId);
  if (!rol || rol === "consulta") return { error: "Tu rol es de solo consulta: no puedes anotar novedades." };
  const t = z.string().trim().min(3).max(1000).safeParse(i?.texto);
  if (!t.success) return { error: "El texto debe tener entre 3 y 1000 caracteres." };
  if (!i?.finca) return { error: "Falta la finca: pregunta a cuál se refiere." };
  const r = await resolver(ctx.db, i.finca, i?.parcela);
  if (esError(r)) return r;
  const fecha = fechaZ.safeParse(i?.fecha ?? new Date().toISOString().slice(0, 10));
  if (!fecha.success) return { error: "La fecha debe ser YYYY-MM-DD." };
  const tipo = z.enum(["avance", "incidencia", "aviso", "otro"]).catch("avance").parse(i?.tipo);
  const tema = typeof i?.tema === "string" && i.tema.trim() ? i.tema.trim().slice(0, 80) : null;
  return guardar(ctx, "registrar_novedad", { finca_id: r.finca_id, parcela_id: r.parcela_id ?? null, texto: t.data, tema, tipo, fecha: fecha.data, conversacion_id: ctx.conversacionId },
    `Anotar en el diario de ${r.finca}${r.parcela ? ` · ${r.parcela}` : ""} (${tipo}${tema ? ` · ${tema}` : ""}) · ${dmy(fecha.data)}\n«${t.data}»`);
}

export async function buscarDiario(i: any, ctx: Ctx): Promise<unknown> {
  const r = await resolver(ctx.db, i?.finca);
  if (esError(r)) return r;
  let q = ctx.db.from("diario_fincas").select("num,fecha,tipo,tema,texto,created_at,fincas(nombre),parcelas(codigo),autor_nombre").eq("activa", true);
  if (r.finca_id) q = q.eq("finca_id", r.finca_id);
  for (const [k, op] of [["desde", "gte"], ["hasta", "lte"]] as const) {
    if (i?.[k]) { if (!fechaZ.safeParse(i[k]).success) return { error: `${k} debe ser YYYY-MM-DD` }; q = (q as any)[op]("fecha", i[k]); }
  }
  const palabras = String(i?.texto ?? "").replace(/[%*,()\\]/g, " ").trim().split(/\s+/).filter((w) => w.length >= 3).slice(0, 4);
  if (palabras.length) q = q.or(palabras.flatMap((w) => [`texto.ilike.%${w}%`, `tema.ilike.%${w}%`]).join(","));
  const lim = Math.min(Math.max(Number(i?.limite) || 15, 1), 40);
  const { data, error } = await q.order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(lim);
  if (error) return { error: error.message };
  return {
    novedades: ((data ?? []) as any[]).map((d) => ({ numero: `D${d.num}`, fecha: d.fecha, finca: d.fincas?.nombre, parcela: d.parcelas?.codigo ?? null, tipo: d.tipo, tema: d.tema, texto: d.texto, anotada_por: d.autor_nombre ?? null })),
    nota: "Las más recientes primero. Si no hay nada sobre el asunto, dilo: no lo deduzcas de otras fuentes sin avisar.",
  };
}

export async function proponerRetirarNovedad(i: any, ctx: Ctx): Promise<unknown> {
  const rol = await rolDe(ctx.db, ctx.userId);
  if (!rol || rol === "consulta") return { error: "Tu rol es de solo consulta." };
  const n = z.number().int().positive().safeParse(i?.numero);
  if (!n.success) return { error: "Indica el número de la anotación (D12 → 12)." };
  const { data } = await ctx.db.from("diario_fincas").select("id,num,texto,created_by,activa,fincas(nombre)").eq("num", n.data).maybeSingle();
  if (!data || !data.activa) return { error: `No encuentro la anotación D${n.data} activa.` };
  if (rol === "encargado" && data.created_by !== ctx.userId) return { error: "Un encargado solo puede retirar sus propias anotaciones." };
  return guardar(ctx, "retirar_novedad", { id: data.id }, `Retirar del diario de ${(data as any).fincas?.nombre ?? ""} la anotación D${data.num}\n«${data.texto}»`);
}

export async function aplicarDiario(db: Db, tipo: string, p: any, userId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (tipo === "registrar_novedad") {
    const v = z.object({
      finca_id: z.string().uuid(), parcela_id: z.string().uuid().nullable().optional(), texto: z.string().trim().min(3).max(1000), tema: z.string().max(80).nullable().optional(),
      tipo: z.enum(["avance", "incidencia", "aviso", "otro"]), fecha: fechaZ, conversacion_id: z.string().uuid().nullable().optional(),
    }).safeParse(p);
    if (!v.success) return { ok: false, error: "Acción no válida." };
    const { data, error } = await db.from("diario_fincas").insert({ ...v.data, parcela_id: v.data.parcela_id ?? null, tema: v.data.tema ?? null, conversacion_id: v.data.conversacion_id ?? null, created_by: userId }).select("id").single();
    if (error) return { ok: false, error: /row-level security/i.test(error.message) ? "No tienes permiso para anotar en esa finca." : error.message };
    return { ok: true, id: data.id };
  }
  const id = z.string().uuid().safeParse(p?.id);
  if (!id.success) return { ok: false, error: "Acción no válida." };
  const rol = await rolDe(db, userId);
  let q = db.from("diario_fincas").update({ activa: false, updated_at: new Date().toISOString() }).eq("id", id.data).eq("activa", true);
  if (rol === "encargado") q = q.eq("created_by", userId);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "No se pudo retirar (¿ya no existe o no tienes permiso?)." };
  return { ok: true, id: id.data };
}
