import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { resolverPersonal, esError } from "./resolver";

/**
 * Corregir o anular registros ya guardados (partes, cosechas y gastos) desde el chat.
 * El asistente SOLO propone: nada cambia hasta que la persona confirma, y el cambio queda en el historial (audit_log).
 */
type Db = SupabaseClient;
type Ctx = { db: Db; userId: string; conversacionId: string };

export type Tipo = "parte" | "cosecha" | "gasto";
export const TABLA = { parte: "partes_trabajo", cosecha: "cosechas", gasto: "gastos" } as const;
const NOMBRE: Record<Tipo, string> = { parte: "parte de trabajo", cosecha: "cosecha", gasto: "gasto" };

const fechaZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "debe ser una fecha YYYY-MM-DD");
const hora = z.string().regex(/^\d{2}:\d{2}$/, "debe ser HH:MM").nullable();
const txt = z.string().max(500).nullable();
const CATEGORIAS = ["mano_obra", "insumos", "maquinaria", "combustible", "semillas_plantas", "riego_agua", "herramientas", "transporte", "otros"] as const;
const NATURALEZAS = ["registrado", "presupuesto", "estimacion", "prevision"] as const;

// Campos que se pueden corregir y cómo se validan
const ESQUEMAS: Record<Tipo, Record<string, z.ZodTypeAny>> = {
  parte: {
    fecha: fechaZ, num_trabajadores: z.number().int().positive(), horas_por_trabajador: z.number().positive().max(24),
    horas_extra_por_trabajador: z.number().min(0).max(24), festivo: z.boolean(), hora_entrada: hora, hora_salida: hora,
    tipo_trabajo: txt, actividad: txt, observaciones: txt, coste_hora: z.number().min(0).max(10000).nullable(),
  },
  cosecha: {
    fecha: fechaZ, cultivo: z.string().min(1).max(100), variedad: txt, kg: z.number().positive(), cajas: z.number().int().min(0).nullable(),
    calibre: txt, calidad: txt, destino: txt, observaciones: txt,
  },
  gasto: {
    fecha: fechaZ, categoria: z.enum(CATEGORIAS), proveedor: txt, concepto: txt, importe: z.number().min(0), moneda: z.string().length(3),
    tipo_importe: z.enum(NATURALEZAS), observaciones: txt,
  },
};
// Referencias por nombre (se resuelven a ids)
const REFERENCIAS: Record<Tipo, string[]> = { parte: ["parcela", "lote", "equipo", "trabajador"], cosecha: ["parcela", "lote"], gasto: ["parcela", "lote"] };

/** Columnas que puede tocar una corrección aprobada; se vuelve a comprobar al aplicarla. */
export const COLUMNAS_EDITABLES: Record<string, Set<string>> = {
  partes_trabajo: new Set([...Object.keys(ESQUEMAS.parte), "parcela_id", "lote_id", "equipo_id", "trabajador_id", "coste_hora_extra", "coste_hora_festivo"]),
  cosechas: new Set([...Object.keys(ESQUEMAS.cosecha), "parcela_id", "lote_id"]),
  gastos: new Set([...Object.keys(ESQUEMAS.gasto), "parcela_id", "lote_id"]),
};

const ETIQUETA: Record<string, string> = {
  fecha: "Fecha", num_trabajadores: "Personas", horas_por_trabajador: "Horas por persona", horas_extra_por_trabajador: "Horas extra por persona",
  festivo: "Festivo", hora_entrada: "Entrada", hora_salida: "Salida", tipo_trabajo: "Tipo de trabajo", actividad: "Actividad",
  observaciones: "Observaciones", coste_hora: "Tarifa normal (€/h)", cultivo: "Cultivo", variedad: "Variedad", kg: "Kilogramos", cajas: "Cajas",
  calibre: "Calibre", calidad: "Calidad", destino: "Destino", categoria: "Categoría", proveedor: "Proveedor", concepto: "Concepto",
  importe: "Importe", moneda: "Moneda", tipo_importe: "Naturaleza", parcela: "Parcela", lote: "Lote", equipo: "Equipo", trabajador: "Trabajador",
};

// ---------- piezas puras (se pueden probar sin base de datos) ----------
export function normalizarCambios(tipo: Tipo, crudos: unknown): { escalares: Record<string, unknown>; refs: Record<string, string | null> } | { error: string } {
  if (!crudos || typeof crudos !== "object" || Array.isArray(crudos) || !Object.keys(crudos).length)
    return { error: "Indica qué campos cambiar y su nuevo valor." };
  const escalares: Record<string, unknown> = {}, refs: Record<string, string | null> = {};
  for (const [k, v0] of Object.entries(crudos as Record<string, unknown>)) {
    const esq = ESQUEMAS[tipo][k];
    if (esq) {
      const v = v0 === "" ? null : v0;
      const r = esq.safeParse(v);
      if (!r.success) return { error: `${ETIQUETA[k] ?? k}: ${r.error.issues.map((i) => i.message).join(", ")}` };
      escalares[k] = r.data;
    } else if (REFERENCIAS[tipo].includes(k)) {
      if (v0 !== null && typeof v0 !== "string") return { error: `${ETIQUETA[k]}: indica el nombre o código, o null para quitarlo.` };
      refs[k] = v0 === null || (v0 as string).trim() === "" ? null : (v0 as string).trim();
    } else {
      return { error: `«${k}» no se puede corregir en un ${NOMBRE[tipo]}. Campos permitidos: ${[...Object.keys(ESQUEMAS[tipo]), ...REFERENCIAS[tipo]].join(", ")}.` };
    }
  }
  return { escalares, refs };
}

const dmy = (s: string) => s.split("-").reverse().join("/");
export function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return v.toLocaleString("es-ES", { maximumFractionDigits: 2 });
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return dmy(v);
  if (typeof v === "string" && /^\d{2}:\d{2}:\d{2}$/.test(v)) return v.slice(0, 5);
  return String(v);
}
/** Lista de diferencias antes → después (ignora lo que no cambia de verdad). */
export function diferencias(antes: Record<string, unknown>, despues: Record<string, unknown>) {
  const igual = (a: unknown, b: unknown) => {
    if ((a == null || a === "") && (b == null || b === "")) return true;
    if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
    const sa = String(a ?? ""), sb = String(b ?? "");
    // las horas llegan de la base como 08:00:00 y se escriben 08:00
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(sa) && /^\d{2}:\d{2}(:\d{2})?$/.test(sb)) return sa.slice(0, 5) === sb.slice(0, 5);
    return sa === sb;
  };
  return Object.keys(despues).filter((k) => !igual(antes[k], despues[k])).map((k) => ({ campo: ETIQUETA[k] ?? k, antes: fmt(antes[k]), despues: fmt(despues[k]) }));
}

function resumenRegistro(tipo: Tipo, r: any): string {
  const sitio = `${r.fincas?.nombre ?? ""}${r.parcelas?.codigo ? ` · parcela ${r.parcelas.codigo}` : ""}${r.lotes?.codigo ? ` · lote ${r.lotes.codigo}` : ""}`;
  if (tipo === "parte")
    return `${dmy(r.fecha)} · ${sitio} · ${r.num_trabajadores} persona(s) × ${fmt(r.horas_por_trabajador)} h${r.actividad ? ` · ${r.actividad}` : ""}`;
  if (tipo === "cosecha") return `${dmy(r.fecha)} · ${sitio} · ${r.cultivo}${r.variedad ? ` ${r.variedad}` : ""} · ${fmt(r.kg)} kg`;
  return `${dmy(r.fecha)} · ${sitio} · ${r.categoria} · ${fmt(r.importe)} ${r.moneda}${r.proveedor ? ` · ${r.proveedor}` : ""}`;
}

// ---------- herramientas para el modelo ----------
const TIPOS = ["parte", "cosecha", "gasto"];
export const herramientasCorreccion: Anthropic.Tool[] = [
  {
    name: "buscar_registros",
    description:
      "Busca partes de trabajo, cosechas o gastos ya guardados y devuelve su id y sus datos, para poder corregirlos o anularlos. " +
      "Úsala SIEMPRE antes de proponer una corrección o anulación: nunca adivines un id. Devuelve los 15 más recientes que cumplan el filtro.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: TIPOS }, desde: { type: "string", description: "YYYY-MM-DD" }, hasta: { type: "string", description: "YYYY-MM-DD" },
        finca: { type: "string" }, parcela: { type: "string" },
        texto: { type: "string", description: "Palabra de la actividad (partes), del cultivo (cosechas) o del proveedor/concepto (gastos)" },
      },
      required: ["tipo"],
    },
  },
  {
    name: "proponer_correccion",
    description:
      "Prepara (NO guarda) la corrección de un registro existente para confirmación del usuario, mostrando el antes y el después. " +
      "Solo incluye en `cambios` los campos que cambian. Campos: parte → fecha, num_trabajadores, horas_por_trabajador, horas_extra_por_trabajador, " +
      "festivo, hora_entrada, hora_salida, tipo_trabajo, actividad, observaciones, coste_hora, parcela, lote, equipo, trabajador; " +
      "cosecha → fecha, cultivo, variedad, kg, cajas, calibre, calidad, destino, observaciones, parcela, lote; " +
      "gasto → fecha, categoria, proveedor, concepto, importe, moneda, tipo_importe, observaciones, parcela, lote. " +
      "parcela, lote, equipo y trabajador se indican por nombre/código (null para quitarlos). La finca no se puede cambiar: en ese caso, anular y registrar de nuevo.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: TIPOS }, id: { type: "string", description: "id devuelto por buscar_registros" },
        cambios: { type: "object", additionalProperties: true, description: "campo → nuevo valor" },
      },
      required: ["tipo", "id", "cambios"],
    },
  },
  {
    name: "proponer_anulacion",
    description:
      "Prepara (NO ejecuta) la anulación de un registro: se elimina de la base de datos y queda constancia en el historial. " +
      "Solo responsables y administradores pueden anular. Pide el motivo si el usuario no lo ha dado.",
    input_schema: {
      type: "object",
      properties: { tipo: { type: "string", enum: TIPOS }, id: { type: "string" }, motivo: { type: "string" } },
      required: ["tipo", "id"],
    },
  },
];

async function rolDe(db: Db, userId: string): Promise<string | null> {
  const { data } = await db.from("profiles").select("rol").eq("id", userId).maybeSingle();
  return data?.rol ?? null;
}

async function cargar(db: Db, tipo: Tipo, id: string) {
  const rel = tipo === "parte" ? ", equipos(nombre), trabajadores(nombre)" : "";
  const { data } = await db.from(TABLA[tipo]).select(`*, fincas(nombre), parcelas(codigo), lotes(codigo)${rel}`).eq("id", id).maybeSingle();
  return data as any;
}

function validarEntrada(i: any): { tipo: Tipo; id: string } | { error: string } {
  const t = z.enum(["parte", "cosecha", "gasto"]).safeParse(i?.tipo);
  const id = z.string().uuid().safeParse(i?.id);
  if (!t.success) return { error: "tipo debe ser parte, cosecha o gasto." };
  if (!id.success) return { error: "El id no es válido: búscalo con buscar_registros, no lo supongas." };
  return { tipo: t.data, id: id.data };
}

export async function buscarRegistros(i: any, ctx: Ctx): Promise<unknown> {
  const t = z.enum(["parte", "cosecha", "gasto"]).safeParse(i?.tipo);
  if (!t.success) return { error: "tipo debe ser parte, cosecha o gasto." };
  const tipo = t.data;
  const cols = {
    parte: "id,fecha,num_trabajadores,horas_por_trabajador,horas_extra_por_trabajador,festivo,trabajador_nombre,actividad,tipo_trabajo,coste_total,fincas(nombre),parcelas(codigo),lotes(codigo),equipos(nombre),trabajadores(nombre)",
    cosecha: "id,fecha,cultivo,variedad,kg,cajas,calidad,destino,fincas(nombre),parcelas(codigo),lotes(codigo)",
    gasto: "id,fecha,proveedor,categoria,concepto,importe,moneda,tipo_importe,fincas(nombre),parcelas(codigo),lotes(codigo)",
  }[tipo];
  let q = ctx.db.from(TABLA[tipo]).select(cols).order("fecha", { ascending: false }).limit(15);
  for (const [k, op] of [["desde", "gte"], ["hasta", "lte"]] as const) {
    if (i?.[k]) { if (!fechaZ.safeParse(i[k]).success) return { error: `${k} debe ser YYYY-MM-DD` }; q = (q as any)[op]("fecha", i[k]); }
  }
  if (i?.finca) {
    const { data } = await ctx.db.from("fincas").select("id,nombre,codigo");
    const m = (data ?? []).filter((f) => f.codigo.toLowerCase() === String(i.finca).toLowerCase() || f.nombre.toLowerCase().includes(String(i.finca).toLowerCase()));
    if (m.length !== 1) return { error: m.length ? `«${i.finca}» es ambiguo: ${m.map((f) => f.nombre).join(", ")}` : `No existe la finca «${i.finca}».` };
    q = q.eq("finca_id", m[0].id);
    if (i?.parcela) {
      const { data: ps } = await ctx.db.from("parcelas").select("id,codigo,nombre").eq("finca_id", m[0].id);
      const pq = String(i.parcela).toLowerCase().replace(/^parcela\s*/, "");
      const pm = (ps ?? []).filter((p) => p.codigo.toLowerCase() === pq || (p.nombre ?? "").toLowerCase().includes(pq));
      if (pm.length !== 1) return { error: pm.length ? `«${i.parcela}» es ambigua` : `La finca no tiene la parcela «${i.parcela}».` };
      q = q.eq("parcela_id", pm[0].id);
    }
  }
  if (i?.texto) {
    const t2 = String(i.texto).replace(/[%*,()\\]/g, " ").trim();
    const campos = { parte: ["actividad", "tipo_trabajo"], cosecha: ["cultivo", "variedad"], gasto: ["proveedor", "concepto"] }[tipo];
    if (t2) q = q.or(campos.map((c) => `${c}.ilike.%${t2}%`).join(","));
  }
  const { data, error } = await q;
  if (error) return { error: error.message };
  return {
    tipo, total_devueltos: (data ?? []).length,
    registros: ((data ?? []) as any[]).map((r) => ({ id: r.id, resumen: resumenRegistro(tipo, r), ...r, fincas: undefined, parcelas: undefined, lotes: undefined, equipos: undefined, trabajadores: undefined })),
  };
}

async function guardarAccion(ctx: Ctx, tipo: string, payload: unknown, resumen: string) {
  const { data, error } = await ctx.db.from("acciones_pendientes")
    .insert({ conversacion_id: ctx.conversacionId, user_id: ctx.userId, tipo, payload, resumen }).select("id").single();
  if (error) return { error: error.message };
  return {
    accion_id: data.id, tipo, resumen,
    instruccion: "Propuesta creada y NO aplicada todavía. La persona ya ve la tarjeta con el antes y el después y el botón: no lo repitas; di en una frase natural que te lo dejas preparado para que lo confirme. No afirmes que ya está corregido o anulado.",
  };
}

export async function proponerCorreccion(i: any, ctx: Ctx): Promise<unknown> {
  const e = validarEntrada(i);
  if ("error" in e) return e;
  const { tipo, id } = e;
  const rol = await rolDe(ctx.db, ctx.userId);
  if (!rol || rol === "consulta") return { error: "Tu rol es de solo consulta: no puedes corregir registros." };

  const norm = normalizarCambios(tipo, i.cambios);
  if ("error" in norm) return norm;
  const reg = await cargar(ctx.db, tipo, id);
  if (!reg) return { error: "No encuentro ese registro (o no tienes acceso). Búscalo de nuevo con buscar_registros." };

  const upd: Record<string, unknown> = { ...norm.escalares };
  const antes: Record<string, unknown> = { ...reg, parcela: reg.parcelas?.codigo, lote: reg.lotes?.codigo, equipo: reg.equipos?.nombre, trabajador: reg.trabajadores?.nombre ?? reg.trabajador_nombre };
  const despues: Record<string, unknown> = { ...norm.escalares };

  // Parcela y lote por nombre; al cambiar de parcela el lote se reinicia
  let parcelaId: string | null = reg.parcela_id ?? null;
  let loteId: string | null = reg.lote_id ?? null;
  const refs = norm.refs;
  if ("parcela" in refs) {
    const t = refs.parcela;
    if (t == null) {
      if (tipo === "cosecha") return { error: "Una cosecha necesita parcela." };
      parcelaId = null; loteId = null; despues.parcela = null; despues.lote = null;
    } else {
      const { data } = await ctx.db.from("parcelas").select("id,codigo,nombre").eq("finca_id", reg.finca_id);
      const q = t.toLowerCase().replace(/^parcela\s*/, "");
      const m = (data ?? []).filter((p) => p.codigo.toLowerCase() === q || (p.nombre ?? "").toLowerCase().includes(q));
      if (m.length === 0) return { error: `La finca ${reg.fincas?.nombre} no tiene la parcela «${t}».` };
      if (m.length > 1) return { error: `«${t}» es ambigua: ${m.map((p) => p.codigo).join(", ")}. Pregunta cuál.` };
      parcelaId = m[0].id; loteId = null; despues.parcela = m[0].codigo; despues.lote = null;
    }
    upd.parcela_id = parcelaId; upd.lote_id = loteId;
  }
  if ("lote" in refs) {
    const t = refs.lote;
    if (t == null) { loteId = null; despues.lote = null; }
    else {
      if (!parcelaId) return { error: "Para indicar un lote hace falta una parcela." };
      const { data } = await ctx.db.from("lotes").select("id,codigo,nombre").eq("parcela_id", parcelaId);
      const q = t.toLowerCase().replace(/^lote\s*/, "");
      const m = (data ?? []).filter((l) => l.codigo.toLowerCase() === q || (l.nombre ?? "").toLowerCase().includes(q));
      if (m.length !== 1) return { error: m.length ? `«${t}» es ambiguo: ${m.map((l) => l.codigo).join(", ")}` : `Esa parcela no tiene el lote «${t}».` };
      loteId = m[0].id; despues.lote = m[0].codigo;
    }
    upd.lote_id = loteId;
  }

  if (tipo === "parte") {
    const hayEq = "equipo" in refs, hayTr = "trabajador" in refs;
    if (hayEq || hayTr) {
      if (refs.equipo && refs.trabajador) return { error: "Indica un equipo o un trabajador, no ambos." };
      if (refs.equipo || refs.trabajador) {
        const p = await resolverPersonal(ctx.db, reg.finca_id, refs.equipo ?? undefined, refs.trabajador ?? undefined);
        if (esError(p as any)) return p;
        upd.equipo_id = (p as any).equipo_id ?? null; upd.trabajador_id = (p as any).trabajador_id ?? null;
        despues.equipo = refs.equipo ? (p as any).nombre : null; despues.trabajador = refs.trabajador ? (p as any).nombre : null;
      } else { upd.equipo_id = null; upd.trabajador_id = null; despues.equipo = null; despues.trabajador = null; }
      // Con otro equipo o trabajador, las tarifas del parte se vuelven a tomar de Maestros
      if (!("coste_hora" in norm.escalares)) upd.coste_hora = null;
      upd.coste_hora_extra = null; upd.coste_hora_festivo = null;
    }
    // Si cambia el día, el festivo se recalcula con la lista de festivos (salvo que se indique)
    if ("fecha" in norm.escalares && !("festivo" in norm.escalares)) upd.festivo = false;
    const final: any = { ...reg, ...upd };
    if (Number(final.horas_extra_por_trabajador) > Number(final.horas_por_trabajador)) return { error: "Las horas extra por persona no pueden superar las horas por persona." };
    if (final.trabajador_id && Number(final.num_trabajadores) !== 1) return { error: "Un parte de un trabajador concreto es de 1 persona." };
  }

  const dif = diferencias(antes, despues);
  if (!dif.length) return { error: "No hay nada que cambiar: el registro ya tiene esos valores." };
  const resumen = `Corrección de ${NOMBRE[tipo]}\n${resumenRegistro(tipo, reg)}\n` + dif.map((d) => `• ${d.campo}: ${d.antes} → ${d.despues}`).join("\n") +
    (tipo === "parte" ? "\nEl coste se recalculará con las tarifas." : "");
  return guardarAccion(ctx, "corregir_registro", { tabla: TABLA[tipo], id, updated_at: reg.updated_at, cambios: upd, vista: dif, registro: resumenRegistro(tipo, reg) }, resumen);
}

export async function proponerAnulacion(i: any, ctx: Ctx): Promise<unknown> {
  const e = validarEntrada(i);
  if ("error" in e) return e;
  const { tipo, id } = e;
  const rol = await rolDe(ctx.db, ctx.userId);
  if (rol !== "administrador" && rol !== "responsable") return { error: "Solo un responsable o un administrador puede anular registros. Pídeselo a uno de ellos." };
  const reg = await cargar(ctx.db, tipo, id);
  if (!reg) return { error: "No encuentro ese registro (o no tienes acceso). Búscalo de nuevo con buscar_registros." };
  const motivo = typeof i.motivo === "string" && i.motivo.trim() ? i.motivo.trim().slice(0, 300) : null;
  const resumen = `Anular ${NOMBRE[tipo]}\n${resumenRegistro(tipo, reg)}\n${motivo ? `Motivo: ${motivo}\n` : ""}Se eliminará de la base de datos y quedará constancia en el historial.`;
  return guardarAccion(ctx, "anular_registro", { tabla: TABLA[tipo], id, updated_at: reg.updated_at, motivo, registro: resumenRegistro(tipo, reg) }, resumen);
}

// ---------- aplicar (al confirmar) ----------
type Resultado = { ok: true; id: string } | { ok: false; error: string; caducada?: boolean };
const CADUCADA = "El registro ha cambiado desde que se propuso, ya no existe o no tienes permiso. Vuelve a pedirlo desde el chat.";

export async function aplicarCorreccion(db: Db, p: any): Promise<Resultado> {
  const cols = COLUMNAS_EDITABLES[p?.tabla];
  if (!cols || typeof p.id !== "string" || !p.cambios || typeof p.cambios !== "object") return { ok: false, error: "Acción no válida." };
  for (const k of Object.keys(p.cambios)) if (!cols.has(k)) return { ok: false, error: `Campo no permitido: ${k}` };
  const { data, error } = await db.from(p.tabla).update(p.cambios).eq("id", p.id).eq("updated_at", p.updated_at).select("id");
  if (error) return { ok: false, error: error.message.includes("lote") ? error.message : `No se pudo corregir: ${error.message}` };
  if (!data?.length) return { ok: false, error: CADUCADA, caducada: true };
  return { ok: true, id: p.id };
}

export async function aplicarAnulacion(db: Db, p: any): Promise<Resultado> {
  if (!COLUMNAS_EDITABLES[p?.tabla] || typeof p.id !== "string") return { ok: false, error: "Acción no válida." };
  const { data, error } = await db.from(p.tabla).delete().eq("id", p.id).eq("updated_at", p.updated_at).select("id");
  if (error) return { ok: false, error: `No se pudo anular: ${error.message}` };
  if (!data?.length) return { ok: false, error: CADUCADA, caducada: true };
  return { ok: true, id: p.id };
}
