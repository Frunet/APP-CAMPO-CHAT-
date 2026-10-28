import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { esError, resolver } from "./resolver";

/**
 * Documentos desde el chat (ya no hay pantalla de Documentos):
 * buscar, abrir la revisión de lo leído, y gestionar los documentos que se esperan recibir.
 * Importar los datos de un documento se hace en la tarjeta de revisión del chat, fila a fila, nunca por el modelo.
 */
type Db = SupabaseClient;
type Ctx = { db: Db; userId: string; conversacionId: string };

const fechaZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "debe ser una fecha YYYY-MM-DD");
const TIPOS = ["factura", "albaran", "parte_trabajo", "informe_cosecha", "foto", "otro"];
const dmy = (s?: string | null) => (s ? s.split("-").reverse().join("/") : "sin fecha");

export const herramientasDocumentos: Anthropic.Tool[] = [
  {
    name: "buscar_documentos",
    description:
      "Busca documentos ya subidos por texto (nombre o contenido leído), tipo, estado, finca y fechas. Devuelve id, nombre, tipo, estado " +
      "(subido, procesado, revisado, importado, descartado) y el enlace de descarga del original.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string" }, tipo: { type: "string", enum: TIPOS }, estado: { type: "string", enum: ["subido", "procesado", "revisado", "importado", "descartado"] },
        desde: { type: "string", description: "fecha del documento YYYY-MM-DD" }, hasta: { type: "string" }, finca: { type: "string" },
      },
    },
  },
  {
    name: "documentos_pendientes",
    description:
      "Devuelve: documentos esperados que aún no se han recibido (con id), documentos subidos pendientes de revisar/importar (con id) y gastos registrados sin documento justificativo.",
    input_schema: { type: "object", properties: { finca: { type: "string" } } },
  },
  {
    name: "revisar_documento",
    description:
      "Abre en el chat la tarjeta de revisión de un documento ya leído (tabla editable con las filas detectadas, para que el usuario las corrija y marque las que quiere importar). " +
      "Úsala cuando el usuario quiera ver, revisar o terminar de importar un documento. No importa nada por sí misma.",
    input_schema: { type: "object", properties: { id: { type: "string", description: "id devuelto por buscar_documentos o documentos_pendientes" } }, required: ["id"] },
  },
  {
    name: "proponer_documento_esperado",
    description:
      "Prepara (NO guarda) el aviso de un documento que se espera recibir (p. ej. el informe de cosecha de una finca externa), para confirmación. " +
      "Quedará en la lista de documentos pendientes de recibir. Solo responsables y administradores.",
    input_schema: {
      type: "object",
      properties: {
        finca: { type: "string" }, descripcion: { type: "string" }, tipo: { type: "string", enum: TIPOS },
        fecha_esperada: { type: "string", description: "YYYY-MM-DD (opcional)" },
      },
      required: ["finca", "descripcion"],
    },
  },
  {
    name: "proponer_recepcion_documento",
    description:
      "Prepara (NO guarda) marcar como recibido un documento esperado, enlazándolo con un documento ya subido, para confirmación. " +
      "Ids de documentos_pendientes (esperado) y buscar_documentos (documento).",
    input_schema: {
      type: "object",
      properties: { esperado_id: { type: "string" }, documento_id: { type: "string" } },
      required: ["esperado_id", "documento_id"],
    },
  },
];

export async function buscarDocumentos(i: any, ctx: Ctx): Promise<unknown> {
  const { db } = ctx;
  const ref = await resolver(db, i?.finca);
  if (esError(ref)) return ref;
  let q = db.from("documentos").select("id,nombre,tipo,estado,fecha_documento,created_at,fincas(nombre)").order("created_at", { ascending: false }).limit(20);
  if (ref.finca_id) q = q.eq("finca_id", ref.finca_id);
  if (i?.tipo) q = q.eq("tipo", String(i.tipo));
  if (i?.estado) q = q.eq("estado", String(i.estado));
  if (i?.desde) { if (!fechaZ.safeParse(i.desde).success) return { error: "desde debe ser YYYY-MM-DD" }; q = q.gte("fecha_documento", i.desde); }
  if (i?.hasta) { if (!fechaZ.safeParse(i.hasta).success) return { error: "hasta debe ser YYYY-MM-DD" }; q = q.lte("fecha_documento", i.hasta); }
  const t = String(i?.texto ?? "").replace(/[%*,()\\]/g, " ").trim();
  if (t) q = q.or(`nombre.ilike.%${t}%,texto_extraido.ilike.%${t}%`);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return {
    encontrados: ((data ?? []) as any[]).map((d) => ({
      id: d.id, nombre: d.nombre, tipo: d.tipo, estado: d.estado, fecha_documento: d.fecha_documento, finca: d.fincas?.nombre ?? null,
      descargar_original: `/api/documentos/${d.id}/descargar`,
    })),
  };
}

export async function documentosPendientes(i: any, ctx: Ctx): Promise<unknown> {
  const { db } = ctx;
  const ref = await resolver(db, i?.finca);
  if (esError(ref)) return ref;
  let e = db.from("documentos_esperados").select("id,descripcion,tipo,fecha_esperada,fincas(nombre)").is("documento_id", null).order("fecha_esperada");
  let d = db.from("documentos").select("id,nombre,tipo,estado,fecha_documento,fincas(nombre)").in("estado", ["subido", "procesado", "revisado"]).order("created_at", { ascending: false }).limit(30);
  let g = db.from("gastos").select("fecha,importe,moneda,categoria,proveedor,fincas(nombre)").is("documento_id", null).eq("tipo_importe", "registrado").order("fecha", { ascending: false }).limit(50);
  if (ref.finca_id) { e = e.eq("finca_id", ref.finca_id); d = d.eq("finca_id", ref.finca_id); g = g.eq("finca_id", ref.finca_id); }
  const [esp, sub, gas] = await Promise.all([e, d, g]);
  return {
    documentos_esperados_sin_recibir: esp.data ?? [],
    documentos_subidos_pendientes_de_importar: sub.data ?? [],
    gastos_sin_justificar: gas.data ?? [],
    fecha_hoy: new Date().toISOString().slice(0, 10),
  };
}

export async function revisarDocumento(i: any, ctx: Ctx): Promise<unknown> {
  const id = z.string().uuid().safeParse(i?.id);
  if (!id.success) return { error: "El id no es válido: búscalo con buscar_documentos, no lo supongas." };
  const { data } = await ctx.db.from("documentos").select("id,nombre,estado,tipo,datos_extraidos").eq("id", id.data).maybeSingle();
  if (!data) return { error: "No encuentro ese documento (o no tienes acceso)." };
  const ext = (data as any).datos_extraidos;
  if (!ext) return { error: `El documento «${data.nombre}» aún no se ha leído (estado: ${data.estado}). El usuario puede volver a adjuntarlo o pedir que se lea de nuevo desde la tarjeta.`, mostrar_documento: data.id };
  return {
    mostrar_documento: data.id, nombre: data.nombre, estado: data.estado, resumen: ext.resumen ?? null,
    filas_detectadas: (ext.registros ?? []).length, filas_ya_importadas: (ext.importados ?? []).length,
    instruccion: "La tarjeta de revisión se muestra en el chat debajo de tu respuesta. Indica que debe revisar y marcar las filas y pulsar «Importar». No importes nada tú.",
  };
}

async function esResponsable(db: Db, userId: string) {
  const { data } = await db.from("profiles").select("rol").eq("id", userId).maybeSingle();
  return data?.rol === "administrador" || data?.rol === "responsable";
}
async function guardar(ctx: Ctx, tipo: string, payload: unknown, resumen: string) {
  const { data, error } = await ctx.db.from("acciones_pendientes").insert({ conversacion_id: ctx.conversacionId, user_id: ctx.userId, tipo, payload, resumen }).select("id").single();
  if (error) return { error: error.message };
  return { accion_id: data.id, tipo, resumen, instruccion: "Propuesta creada y NO guardada todavía. La persona ya ve la tarjeta con el resumen y el botón: no repitas el resumen ni los datos; di en una frase natural que te lo dejas preparado para que lo confirme. No afirmes que ya está guardado." };
}

export async function proponerDocumentoEsperado(i: any, ctx: Ctx): Promise<unknown> {
  if (!(await esResponsable(ctx.db, ctx.userId))) return { error: "Solo un responsable o un administrador puede anotar documentos esperados." };
  const ref = await resolver(ctx.db, i?.finca);
  if (esError(ref)) return ref;
  if (!ref.finca_id) return { error: "Falta la finca. Pregunta al usuario." };
  const desc = z.string().min(1).max(300).safeParse(i?.descripcion);
  if (!desc.success) return { error: "Falta la descripción del documento." };
  if (i?.fecha_esperada && !fechaZ.safeParse(i.fecha_esperada).success) return { error: "fecha_esperada debe ser YYYY-MM-DD." };
  const tipo = TIPOS.includes(i?.tipo) ? i.tipo : "otro";
  return guardar(ctx, "crear_documento_esperado", { finca_id: ref.finca_id, descripcion: desc.data, tipo, fecha_esperada: i?.fecha_esperada ?? null },
    `Documento esperado · ${ref.finca}\n${desc.data}${i?.fecha_esperada ? `\nFecha esperada: ${dmy(i.fecha_esperada)}` : ""}\nSe avisará cuando llegue la fecha si aún no se ha recibido.`);
}

export async function proponerRecepcionDocumento(i: any, ctx: Ctx): Promise<unknown> {
  if (!(await esResponsable(ctx.db, ctx.userId))) return { error: "Solo un responsable o un administrador puede marcar documentos como recibidos." };
  const e = z.string().uuid().safeParse(i?.esperado_id), d = z.string().uuid().safeParse(i?.documento_id);
  if (!e.success || !d.success) return { error: "Los ids no son válidos: búscalos con documentos_pendientes y buscar_documentos." };
  const [{ data: esp }, { data: doc }] = await Promise.all([
    ctx.db.from("documentos_esperados").select("id,descripcion,documento_id,fincas(nombre)").eq("id", e.data).maybeSingle(),
    ctx.db.from("documentos").select("id,nombre").eq("id", d.data).maybeSingle(),
  ]);
  if (!esp || !doc) return { error: "No encuentro el documento esperado o el documento subido (o no tienes acceso)." };
  if ((esp as any).documento_id) return { error: "Ese documento esperado ya figura como recibido." };
  return guardar(ctx, "recibir_documento_esperado", { id: e.data, documento_id: d.data },
    `Marcar como recibido\nEsperado: ${(esp as any).descripcion}${(esp as any).fincas?.nombre ? ` · ${(esp as any).fincas.nombre}` : ""}\nDocumento: ${doc.nombre}`);
}

/** Aplica las acciones propias de documentos al confirmar (la inserción de «crear_documento_esperado» la hace la ruta general). */
export async function aplicarRecepcion(db: Db, p: any): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const e = z.string().uuid().safeParse(p?.id), d = z.string().uuid().safeParse(p?.documento_id);
  if (!e.success || !d.success) return { ok: false, error: "Acción no válida." };
  const { data, error } = await db.from("documentos_esperados")
    .update({ documento_id: d.data, recibido_at: new Date().toISOString() }).eq("id", e.data).is("documento_id", null).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Ya estaba recibido, no existe o no tienes permiso." };
  return { ok: true, id: e.data };
}
