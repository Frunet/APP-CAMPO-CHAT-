import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { esError, resolver } from "./resolver";

/**
 * Maestros por el chat (alta, modificación, baja y reactivación) con confirmación.
 * - El administrador puede con todos los maestros. NO se gestionan usuarios ni contraseñas por el chat.
 * - Encargados y responsables solo pueden DAR DE ALTA trabajadores y equipos de sus fincas, sin tarifas (las pone el administrador).
 * El asistente solo propone; al confirmar se aplica con la sesión del usuario (RLS) y se vuelve a validar todo.
 */
type Db = SupabaseClient;
type Ctx = { db: Db; userId: string; conversacionId: string };
type T = "s" | "n" | "f" | `e:${string}`;
type Espec = {
  tabla: string; etiqueta: string; campos: Record<string, T>; oblig: string[];
  ambito: "finca" | "finca_opcional" | "parcela" | "global"; claves: string[];
  baja?: { campo: string; off: unknown; on: unknown }; personal?: boolean;
};
const TARIFAS = ["coste_hora", "coste_hora_extra", "coste_hora_festivo", "condiciones"];
const CATS = "insumos,suministros,consumibles,mano_obra,reparaciones,otros_gastos,personal_fijo,servicios_profesionales,instalaciones,gastos_generales,gastos_financieros";

const ESPECS: Record<string, Espec> = {
  trabajador: { tabla: "trabajadores", etiqueta: "trabajador", ambito: "finca_opcional", claves: ["nombre"], oblig: ["nombre"], personal: true, baja: { campo: "activo", off: false, on: true },
    campos: { nombre: "s", coste_hora: "n", coste_hora_extra: "n", coste_hora_festivo: "n", condiciones: "s" } },
  equipo: { tabla: "equipos", etiqueta: "equipo (cuadrilla)", ambito: "finca", claves: ["nombre"], oblig: ["nombre"], personal: true, baja: { campo: "activo", off: false, on: true },
    campos: { nombre: "s", coste_hora: "n", coste_hora_extra: "n", coste_hora_festivo: "n", condiciones: "s" } },
  finca: { tabla: "fincas", etiqueta: "finca", ambito: "global", claves: ["codigo", "nombre"], oblig: ["codigo", "nombre"], baja: { campo: "activa", off: false, on: true },
    campos: { codigo: "s", nombre: "s", ubicacion: "s", tipo_explotacion: "e:propia,arrendada,terceros", superficie_ha: "n", observaciones: "s" } },
  parcela: { tabla: "parcelas", etiqueta: "parcela", ambito: "finca", claves: ["codigo", "nombre"], oblig: ["codigo"], baja: { campo: "estado", off: "inactiva", on: "activa" },
    campos: { codigo: "s", nombre: "s", superficie_ha: "n", estado: "e:activa,en_preparacion,en_descanso,inactiva", observaciones: "s" } },
  lote: { tabla: "lotes", etiqueta: "lote", ambito: "parcela", claves: ["codigo", "nombre"], oblig: ["codigo"], baja: { campo: "estado", off: "inactiva", on: "activa" },
    campos: { codigo: "s", nombre: "s", superficie_ha: "n", estado: "e:activa,en_preparacion,en_descanso,inactiva", observaciones: "s" } },
  cultivo: { tabla: "cultivos_maestro", etiqueta: "cultivo del catálogo", ambito: "global", claves: ["cultivo", "variedad"], oblig: ["cultivo"], baja: { campo: "activo", off: false, on: true },
    campos: { cultivo: "s", variedad: "s" } },
  festivo: { tabla: "festivos", etiqueta: "festivo", ambito: "finca_opcional", claves: ["nombre"], oblig: ["fecha", "nombre"],
    campos: { fecha: "f", nombre: "s" } },
  campana: { tabla: "campanas", etiqueta: "campaña", ambito: "global", claves: ["nombre"], oblig: ["nombre", "fecha_inicio"],
    campos: { nombre: "s", fecha_inicio: "f", fecha_fin: "f" } },
  proveedor: { tabla: "proveedores", etiqueta: "proveedor", ambito: "global", claves: ["nombre", "nif"], oblig: ["nombre"], baja: { campo: "activo", off: false, on: true },
    campos: { nombre: "s", nif: "s", categoria_defecto: `e:${CATS}` } },
  identificador: { tabla: "finca_identificadores", etiqueta: "identificador de finca", ambito: "finca", claves: ["valor"], oblig: ["tipo", "valor"],
    campos: { tipo: "e:alias,catastro,direccion,cups,contador,matricula,otro", valor: "s" } },
  empresa: { tabla: "empresas_propias", etiqueta: "empresa propia", ambito: "global", claves: ["nombre", "nif"], oblig: ["nombre", "nif"],
    campos: { nombre: "s", nif: "s" } },
};

const dmy = (s: string) => s.split("-").reverse().join("/");
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const herramientasMaestros: Anthropic.Tool[] = [
  {
    name: "proponer_maestro",
    description:
      "Prepara (NO guarda) un alta, modificación, baja o reactivación de DATOS DE BASE (maestros), para confirmación. Entidades: trabajador, equipo, finca, parcela, lote, cultivo (catálogo), festivo, campana, proveedor, identificador (de finca), empresa (propia). " +
      "Solo el administrador puede con todo; encargados y responsables solo pueden DAR DE ALTA trabajadores y equipos de sus fincas, sin tarifas. NO se gestionan usuarios ni contraseñas por el chat (eso es Maestros → Usuarios). Para borrar de verdad, se hace en Maestros: aquí solo se da de baja. " +
      "Alta: indica los datos obligatorios; si falta alguno, PREGUNTA. Trabajador: nombre y finca (o todas_las_fincas); la tarifa no es obligatoria. Parcela: finca y código. Lote: finca, parcela y código. " +
      "Modificar/baja/alta: indica «referencia» (nombre o código de lo que hay que cambiar) y, si procede, la finca/parcela; en modificar, solo los campos que cambian en «datos». Los registros pasados conservan la tarifa con la que se calcularon.",
    input_schema: {
      type: "object",
      properties: {
        entidad: { type: "string", enum: Object.keys(ESPECS) },
        accion: { type: "string", enum: ["crear", "modificar", "baja", "alta"], description: "baja = desactivar (no borra); alta = reactivar" },
        finca: { type: "string" }, parcela: { type: "string", description: "Solo para lotes" },
        todas_las_fincas: { type: "boolean", description: "Trabajador o festivo que vale para todas las fincas (solo administrador)" },
        referencia: { type: "string", description: "Nombre o código de lo que se modifica, da de baja o reactiva" },
        datos: {
          type: "object",
          description: "Campos del alta o los que cambian en una modificación",
          properties: {
            nombre: { type: "string" }, codigo: { type: "string" }, variedad: { type: "string" }, cultivo: { type: "string" }, ubicacion: { type: "string" },
            tipo_explotacion: { type: "string", enum: ["propia", "arrendada", "terceros"] }, superficie_ha: { type: "number" }, observaciones: { type: "string" },
            estado: { type: "string", enum: ["activa", "en_preparacion", "en_descanso", "inactiva"] },
            coste_hora: { type: "number", description: "€/h normal" }, coste_hora_extra: { type: "number", description: "€/h extra" }, coste_hora_festivo: { type: "number", description: "€/h festivo" },
            condiciones: { type: "string", description: "Condiciones acordadas (texto libre)" },
            fecha: { type: "string", description: "YYYY-MM-DD (festivo)" }, fecha_inicio: { type: "string", description: "YYYY-MM-DD (campaña)" }, fecha_fin: { type: "string", description: "YYYY-MM-DD (campaña)" },
            nif: { type: "string" }, categoria_defecto: { type: "string", description: "Concepto de la cuenta de resultados por defecto del proveedor" },
            tipo: { type: "string", description: "Tipo de identificador: alias, catastro, direccion, cups, contador, matricula, otro" }, valor: { type: "string", description: "Valor del identificador" },
          },
        },
      },
      required: ["entidad", "accion"],
    },
  },
];

const zodDe = (t: T) => {
  if (t === "s") return z.string().trim().min(1).max(300);
  if (t === "n") return z.number().min(0).max(100_000_000);
  if (t === "f") return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "debe ser una fecha YYYY-MM-DD");
  return z.enum(t.slice(2).split(",") as [string, ...string[]]);
};

/** Valida y limpia los campos contra la lista permitida de la entidad. */
function valores(e: Espec, datos: any, esAdmin: boolean): { v: Record<string, unknown> } | { error: string } {
  const v: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(datos ?? {})) {
    if (raw === null || raw === undefined || raw === "") continue;
    const t = e.campos[k];
    if (!t) return { error: `El campo «${k}» no existe para ${e.etiqueta}. Campos: ${Object.keys(e.campos).join(", ")}.` };
    if (TARIFAS.includes(k) && !esAdmin) return { error: "Las tarifas y condiciones del personal solo las puede fijar el administrador (Maestros → Personal)." };
    const r = zodDe(t).safeParse(t === "n" ? Number(raw) : raw);
    if (!r.success) return { error: `«${k}»: ${r.error.issues[0]?.message ?? "valor no válido"}` };
    v[k] = r.data;
  }
  return { v };
}

async function rolDe(db: Db, userId: string) {
  const { data } = await db.from("profiles").select("rol").eq("id", userId).maybeSingle();
  return data?.rol as string | undefined;
}
async function guardar(ctx: Ctx, payload: unknown, resumen: string) {
  const { data, error } = await ctx.db.from("acciones_pendientes").insert({ conversacion_id: ctx.conversacionId, user_id: ctx.userId, tipo: "cambiar_maestro", payload, resumen }).select("id").single();
  if (error) return { error: error.message };
  return { accion_id: data.id, tipo: "cambiar_maestro", resumen, instruccion: "Propuesta creada y NO guardada todavía. Muestra el resumen y di que debe confirmarla con el botón." };
}

export async function proponerMaestro(i: any, ctx: Ctx): Promise<unknown> {
  const e = ESPECS[String(i?.entidad)];
  if (!e) return { error: `Entidad no válida. Usa: ${Object.keys(ESPECS).join(", ")}. Los usuarios se gestionan en Maestros → Usuarios, no por el chat.` };
  const accion = z.enum(["crear", "modificar", "baja", "alta"]).safeParse(i?.accion);
  if (!accion.success) return { error: "La acción debe ser crear, modificar, baja o alta." };
  const rol = await rolDe(ctx.db, ctx.userId);
  const esAdmin = rol === "administrador";
  if (!esAdmin) {
    if (!(e.personal && accion.data === "crear" && (rol === "encargado" || rol === "responsable")))
      return { error: esAdmin ? "" : `Solo el administrador puede ${accion.data === "crear" ? "crear" : "cambiar"} ${e.etiqueta}s por el chat. ${e.personal ? "Tú puedes dar de alta trabajadores y equipos (sin tarifa)." : "Pídeselo al administrador."}` };
  }
  if (accion.data !== "crear" && !e.baja && accion.data !== "modificar") return { error: `${e.etiqueta} no se da de baja: se borra desde Maestros.` };

  // Ámbito: finca / parcela
  let fincaId: string | null = null, parcelaId: string | null = null, fincaNombre = "", donde = "";
  if (e.ambito !== "global" && (accion.data === "crear" || i?.finca)) {
    if (i?.todas_las_fincas === true) {
      if (!esAdmin || e.ambito !== "finca_opcional") return { error: "Solo el administrador puede crear algo para todas las fincas, y solo trabajadores y festivos." };
    } else if (!i?.finca) {
      return { error: e.ambito === "finca_opcional" ? "Indica la finca, o si vale para todas las fincas (todas_las_fincas)." : "Falta la finca. Pregunta." };
    } else {
      const r = await resolver(ctx.db, i.finca, e.ambito === "parcela" ? i?.parcela : undefined);
      if (esError(r)) return r;
      if (e.ambito === "parcela" && !r.parcela_id) return { error: "Falta la parcela del lote. Pregunta." };
      fincaId = r.finca_id ?? null; parcelaId = r.parcela_id ?? null; fincaNombre = r.finca ?? "";
      donde = ` · ${fincaNombre}${e.ambito === "parcela" ? ` · parcela ${r.parcela}` : ""}`;
    }
  }
  const vv = valores(e, i?.datos, esAdmin);
  if ("error" in vv) return vv;
  const v = vv.v;

  if (accion.data === "crear") {
    const falta = e.oblig.filter((k) => v[k] == null);
    if (falta.length) return { error: `Faltan datos obligatorios: ${falta.join(", ")}. Pregunta al usuario.` };
    const nombreCampo = e.claves[0];
    // duplicados que la base de datos no impide
    if (e.tabla === "trabajadores" || e.tabla === "cultivos_maestro") {
      let q = ctx.db.from(e.tabla).select("id").ilike(nombreCampo, String(v[nombreCampo]));
      if (e.tabla === "trabajadores") q = fincaId ? q.eq("finca_id", fincaId) : q.is("finca_id", null);
      if (e.tabla === "cultivos_maestro") q = v.variedad ? q.ilike("variedad", String(v.variedad)) : q.is("variedad", null);
      const { data } = await q.limit(1);
      if (data?.length) return { error: `Ya existe ${e.etiqueta} «${v[nombreCampo]}»${fincaNombre ? ` en ${fincaNombre}` : ""}.` };
    }
    const fila: Record<string, unknown> = { ...v };
    if (e.tabla === "finca_identificadores") fila.valor_norm = norm(v.valor);
    if (e.ambito === "finca" || (e.ambito === "finca_opcional" && fincaId)) fila.finca_id = fincaId;
    if (e.ambito === "parcela") fila.parcela_id = parcelaId;
    const lineas = Object.entries(v).map(([k, x]) => `• ${k.replace(/_/g, " ")}: ${k.startsWith("coste_hora") ? `${x} €/h` : k.startsWith("fecha") ? dmy(String(x)) : x}`);
    return guardar(ctx, { entidad: i.entidad, op: "insert", tabla: e.tabla, valores: fila },
      `Crear ${e.etiqueta}${donde || (e.ambito === "finca_opcional" ? " · todas las fincas" : "")}\n${lineas.join("\n")}${e.personal && !esAdmin ? "\n(Sin tarifa: la fijará el administrador en Maestros → Personal)" : ""}`);
  }

  // modificar / baja / alta: localizar el registro
  const ref = String(i?.referencia ?? "").trim();
  if (!ref) return { error: "Indica la referencia (nombre o código) de lo que hay que cambiar." };
  let q = ctx.db.from(e.tabla).select("*");
  if (e.ambito === "finca" || (e.ambito === "finca_opcional" && fincaId)) { if (fincaId) q = q.eq("finca_id", fincaId); }
  if (e.ambito === "parcela" && parcelaId) q = q.eq("parcela_id", parcelaId);
  const { data: todos, error } = await q.limit(500);
  if (error) return { error: error.message };
  const n = norm(ref);
  const cand = ((todos ?? []) as any[]).filter((r) => e.claves.some((k) => norm(r[k]).includes(n) && n.length > 0));
  const exactos = cand.filter((r) => e.claves.some((k) => norm(r[k]) === n));
  const m = exactos.length === 1 ? exactos : cand;
  if (!m.length) return { error: `No encuentro ${e.etiqueta} «${ref}»${fincaNombre ? ` en ${fincaNombre}` : ""}.` };
  if (m.length > 1) return { error: `«${ref}» es ambiguo: ${m.slice(0, 6).map((r) => e.claves.map((k) => r[k]).filter(Boolean).join(" / ")).join("; ")}. Pregunta cuál.` };
  const reg = m[0];
  const nombreReg = e.claves.map((k) => reg[k]).filter(Boolean).join(" / ");

  if (accion.data === "modificar") {
    if (!Object.keys(v).length) return { error: "Indica qué datos cambian (en «datos»)." };
    const cambios = Object.entries(v).filter(([k, x]) => String(reg[k] ?? "") !== String(x));
    if (!cambios.length) return { error: "Eso ya es así: no hay nada que cambiar." };
    const lineas = cambios.map(([k, x]) => `• ${k.replace(/_/g, " ")}: ${reg[k] == null ? "—" : reg[k]} → ${x}`);
    return guardar(ctx, { entidad: i.entidad, op: "update", tabla: e.tabla, id: reg.id, valores: Object.fromEntries(cambios) },
      `Modificar ${e.etiqueta} «${nombreReg}»${donde}\n${lineas.join("\n")}${TARIFAS.some((t) => cambios.some(([k]) => k === t)) ? "\n(Los partes ya registrados conservan la tarifa con la que se calcularon)" : ""}`);
  }
  const b = e.baja!;
  const nuevo = accion.data === "baja" ? b.off : b.on;
  if (reg[b.campo] === nuevo) return { error: `Ya está ${accion.data === "baja" ? "dado de baja" : "activo"}.` };
  return guardar(ctx, { entidad: i.entidad, op: "update", tabla: e.tabla, id: reg.id, valores: { [b.campo]: nuevo } },
    `${accion.data === "baja" ? "Dar de baja" : "Reactivar"} ${e.etiqueta} «${nombreReg}»${donde}\n(No se borra nada: los datos y registros anteriores se conservan)`);
}

/** Se aplica al confirmar, con la sesión del usuario: se re-valida la entidad, los campos y el rol. */
export async function aplicarMaestro(db: Db, p: any, userId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const e = ESPECS[String(p?.entidad)];
  if (!e || p?.tabla !== e.tabla || (p?.op !== "insert" && p?.op !== "update")) return { ok: false, error: "Acción no válida." };
  const rol = await rolDe(db, userId);
  const esAdmin = rol === "administrador";
  if (!esAdmin && !(e.personal && p.op === "insert" && (rol === "encargado" || rol === "responsable"))) return { ok: false, error: "No tienes permiso para cambiar este maestro." };
  const raw = { ...(p.valores ?? {}) } as Record<string, unknown>;
  delete raw.valor_norm; // se recalcula aquí, no se fía del payload
  const ids: Record<string, unknown> = {};
  for (const k of ["finca_id", "parcela_id", "activo", "activa"]) if (k in raw) { ids[k] = raw[k]; delete raw[k]; }
  if (ids.finca_id != null && !z.string().uuid().safeParse(ids.finca_id).success) return { ok: false, error: "Acción no válida." };
  if (ids.parcela_id != null && !z.string().uuid().safeParse(ids.parcela_id).success) return { ok: false, error: "Acción no válida." };
  const vv = valores(e, raw, esAdmin);
  if ("error" in vv) return { ok: false, error: vv.error };
  const fila: Record<string, unknown> = { ...vv.v };
  if (p.op === "insert") {
    if (ids.finca_id !== undefined) fila.finca_id = ids.finca_id;
    if (ids.parcela_id !== undefined) fila.parcela_id = ids.parcela_id;
    const falta = e.oblig.filter((k) => fila[k] == null);
    if (falta.length) return { ok: false, error: `Faltan datos: ${falta.join(", ")}.` };
    if (e.tabla === "finca_identificadores") fila.valor_norm = norm(fila.valor);
    const { data, error } = await db.from(e.tabla).insert(fila).select("id").single();
    if (error) return { ok: false, error: error.code === "23505" ? "Ya existe uno igual." : /row-level security/i.test(error.message) ? "No tienes permiso para crear eso." : error.message };
    return { ok: true, id: data.id };
  }
  if (!z.string().uuid().safeParse(p.id).success) return { ok: false, error: "Acción no válida." };
  const b = e.baja;
  for (const k of ["activo", "activa"]) if (k in ids && b?.campo === k && typeof ids[k] === "boolean") fila[k] = ids[k];
  if (b && (p.valores?.[b.campo] !== undefined) && !(b.campo in fila)) fila[b.campo] = p.valores[b.campo]; // estado de parcela/lote
  if (!Object.keys(fila).length) return { ok: false, error: "No hay nada que cambiar." };
  if (e.tabla === "finca_identificadores" && fila.valor) fila.valor_norm = norm(fila.valor);
  const { data, error } = await db.from(e.tabla).update(fila).eq("id", p.id).select("id");
  if (error) return { ok: false, error: error.code === "23505" ? "Ya existe uno igual." : error.message };
  if (!data?.length) return { ok: false, error: "No se pudo cambiar (¿ya no existe o no tienes permiso?)." };
  return { ok: true, id: p.id };
}
