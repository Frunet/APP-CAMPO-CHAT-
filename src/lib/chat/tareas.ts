import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { lunesDe } from "@/lib/tiempo";
import { esError, resolver } from "./resolver";

/**
 * Tareas del calendario desde el chat: buscar, asignar (a un día, a una semana o dejarlas pendientes de asignar) y completar.
 * Crear tareas lo hace proponer_tarea (tools.ts). Todo cambio pide confirmación en el chat.
 */
type Db = SupabaseClient;
type Ctx = { db: Db; userId: string; conversacionId: string };

const fechaZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "debe ser una fecha YYYY-MM-DD");
const dmy = (s: string) => s.split("-").reverse().join("/");
const semanaTxt = (l: string) => { const d = new Date(l + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 6); return `semana del ${dmy(l)} al ${dmy(d.toISOString().slice(0, 10))}`; };
const cuando = (fecha: string | null, semana: string | null) => (fecha ? `el ${dmy(fecha)}` : semana ? semanaTxt(semana) : "pendiente de asignar (sin día ni semana)");

export const herramientasTareas: Anthropic.Tool[] = [
  {
    name: "buscar_tareas",
    description:
      "Busca tareas del calendario y devuelve su id, título, día, semana asignada y si están completadas. Úsala SIEMPRE antes de asignar o completar una tarea: nunca adivines un id. " +
      "estado: 'pendientes_de_asignar' (sin día ni semana), 'asignadas_a_semana' (semana sin día), 'con_dia', 'completadas' o 'abiertas' (todas las no completadas, por defecto).",
    input_schema: {
      type: "object",
      properties: {
        estado: { type: "string", enum: ["pendientes_de_asignar", "asignadas_a_semana", "con_dia", "completadas", "abiertas"] },
        texto: { type: "string", description: "palabra del título" }, finca: { type: "string" },
        desde: { type: "string", description: "YYYY-MM-DD (sobre el día o la semana)" }, hasta: { type: "string" },
      },
    },
  },
  {
    name: "proponer_asignacion_tarea",
    description:
      "Prepara (NO guarda) el cambio de CUÁNDO se hace una tarea existente, para confirmación: modo 'dia' (con fecha), 'semana' (con cualquier fecha de esa semana; la tarea queda asignada a la semana sin día fijo) " +
      "o 'pendiente' (la deja sin día ni semana, pendiente de asignar).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id devuelto por buscar_tareas" }, modo: { type: "string", enum: ["dia", "semana", "pendiente"] },
        fecha: { type: "string", description: "modo dia: el día YYYY-MM-DD" }, semana: { type: "string", description: "modo semana: cualquier fecha YYYY-MM-DD de esa semana" },
      },
      required: ["id", "modo"],
    },
  },
  {
    name: "proponer_completar_tarea",
    description: "Prepara (NO guarda) marcar una tarea como hecha (o volver a abrirla), para confirmación.",
    input_schema: { type: "object", properties: { id: { type: "string" }, hecha: { type: "boolean", description: "true = completada (por defecto); false = reabrir" } }, required: ["id"] },
  },
];

export async function buscarTareas(i: any, ctx: Ctx): Promise<unknown> {
  const { db } = ctx;
  const ref = await resolver(db, i?.finca);
  if (esError(ref)) return ref;
  let q = db.from("tareas").select("id,titulo,fecha,semana_inicio,completada,tipo,fincas(nombre)").limit(30);
  const estado = i?.estado ?? "abiertas";
  if (estado === "completadas") q = q.eq("completada", true);
  else q = q.eq("completada", false);
  if (estado === "pendientes_de_asignar") q = q.is("fecha", null).is("semana_inicio", null);
  if (estado === "asignadas_a_semana") q = q.is("fecha", null).not("semana_inicio", "is", null);
  if (estado === "con_dia") q = q.not("fecha", "is", null);
  if (ref.finca_id) q = q.eq("finca_id", ref.finca_id);
  for (const [k, op] of [["desde", "gte"], ["hasta", "lte"]] as const) {
    if (i?.[k]) { if (!fechaZ.safeParse(i[k]).success) return { error: `${k} debe ser YYYY-MM-DD` }; q = (q as any)[op]("semana_inicio", k === "desde" ? lunesDe(i[k]) : i[k]); }
  }
  const t = String(i?.texto ?? "").replace(/[%*,()\\]/g, " ").trim();
  if (t) q = q.ilike("titulo", `%${t}%`);
  const { data, error } = await q.order("fecha", { ascending: true, nullsFirst: false }).order("titulo");
  if (error) return { error: error.message };
  return {
    estado,
    tareas: ((data ?? []) as any[]).map((r) => ({
      id: r.id, titulo: r.titulo, cuando: cuando(r.fecha, r.semana_inicio), fecha: r.fecha, semana_inicio: r.semana_inicio, completada: r.completada, tipo: r.tipo, finca: r.fincas?.nombre ?? null,
    })),
  };
}

async function puedeEditar(db: Db, userId: string) {
  const { data } = await db.from("profiles").select("rol").eq("id", userId).maybeSingle();
  return !!data?.rol && data.rol !== "consulta";
}
async function guardar(ctx: Ctx, tipo: string, payload: unknown, resumen: string) {
  const { data, error } = await ctx.db.from("acciones_pendientes").insert({ conversacion_id: ctx.conversacionId, user_id: ctx.userId, tipo, payload, resumen }).select("id").single();
  if (error) return { error: error.message };
  return { accion_id: data.id, tipo, resumen, instruccion: "Propuesta creada y NO guardada todavía. Muestra el resumen y di que debe confirmarla con el botón." };
}
async function cargarTarea(db: Db, id: unknown) {
  const v = z.string().uuid().safeParse(id);
  if (!v.success) return { error: "El id no es válido: búscalo con buscar_tareas, no lo supongas." } as const;
  const { data } = await db.from("tareas").select("id,titulo,fecha,semana_inicio,completada").eq("id", v.data).maybeSingle();
  if (!data) return { error: "No encuentro esa tarea (o no tienes acceso). Búscala de nuevo con buscar_tareas." } as const;
  return { t: data as any } as const;
}

export async function proponerAsignacionTarea(i: any, ctx: Ctx): Promise<unknown> {
  if (!(await puedeEditar(ctx.db, ctx.userId))) return { error: "Tu rol es de solo consulta: no puedes cambiar tareas." };
  const c = await cargarTarea(ctx.db, i?.id);
  if ("error" in c) return c;
  const modo = z.enum(["dia", "semana", "pendiente"]).safeParse(i?.modo);
  if (!modo.success) return { error: "modo debe ser dia, semana o pendiente." };
  let fecha: string | null = null, semana: string | null = null;
  if (modo.data === "dia") {
    const f = fechaZ.safeParse(i?.fecha); if (!f.success) return { error: "Para asignar a un día hace falta la fecha (YYYY-MM-DD). Pregunta qué día." };
    fecha = f.data;
  } else if (modo.data === "semana") {
    const s = fechaZ.safeParse(i?.semana); if (!s.success) return { error: "Para asignar a una semana hace falta una fecha de esa semana (YYYY-MM-DD). Pregunta qué semana." };
    semana = lunesDe(s.data);
  }
  const antes = cuando(c.t.fecha, c.t.semana_inicio), despues = cuando(fecha, semana);
  if (antes === despues) return { error: `La tarea ya está ${despues === "pendiente de asignar (sin día ni semana)" ? "pendiente de asignar" : despues}: no hay nada que cambiar.` };
  return guardar(ctx, "asignar_tarea", { id: c.t.id, fecha, semana_inicio: semana },
    `Asignar tarea\n«${c.t.titulo}»\n• Cuándo: ${antes} → ${despues}`);
}

export async function proponerCompletarTarea(i: any, ctx: Ctx): Promise<unknown> {
  if (!(await puedeEditar(ctx.db, ctx.userId))) return { error: "Tu rol es de solo consulta: no puedes cambiar tareas." };
  const c = await cargarTarea(ctx.db, i?.id);
  if ("error" in c) return c;
  const hecha = i?.hecha !== false;
  if (c.t.completada === hecha) return { error: hecha ? "Esa tarea ya está completada." : "Esa tarea ya está abierta." };
  return guardar(ctx, "completar_tarea", { id: c.t.id, completada: hecha }, `${hecha ? "Marcar como hecha" : "Reabrir"} la tarea\n«${c.t.titulo}»`);
}

/** Aplica al confirmar las acciones de tareas que no son altas (las altas las hace la ruta general). */
export async function aplicarTarea(db: Db, tipo: string, p: any): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const id = z.string().uuid().safeParse(p?.id);
  if (!id.success) return { ok: false, error: "Acción no válida." };
  let cambios: Record<string, unknown>;
  if (tipo === "asignar_tarea") {
    const f = fechaZ.nullable().safeParse(p.fecha ?? null), s = fechaZ.nullable().safeParse(p.semana_inicio ?? null);
    if (!f.success || !s.success || (f.data && s.data)) return { ok: false, error: "Acción no válida." };
    cambios = { fecha: f.data, semana_inicio: s.data };
  } else if (tipo === "completar_tarea") {
    cambios = { completada: p.completada === true };
  } else return { ok: false, error: "Acción no válida." };
  const { data, error } = await db.from("tareas").update(cambios).eq("id", id.data).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "No se pudo cambiar la tarea (¿ya no existe o no tienes permiso?)." };
  return { ok: true, id: id.data };
}
