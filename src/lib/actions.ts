"use server";
import { MAX_HORAS_DIA, TAREAS } from "@/lib/horas";
import { buscarTrabajador } from "@/lib/documentos/nombres";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type Res = { error?: string; ok?: string } | null;

// ---------- utilidades ----------
const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const n = (fd: FormData, k: string) => {
  const v = s(fd, k);
  if (v == null) return null;
  const x = Number(v.replace(",", "."));
  return Number.isFinite(x) ? x : NaN;
};
const fechaZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida");

async function sesion() {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (!data.user) throw new Error("Sesión caducada. Vuelve a iniciar sesión.");
  return { db, uid: data.user.id };
}

function msgError(e: { code?: string; message: string }) {
  if (e.code === "23505") return "Ya existe un registro idéntico (duplicado).";
  if (e.code === "42501" || /row-level security/i.test(e.message)) return "No tienes permiso para esta operación en esa finca.";
  if (e.code === "23503") return "No se puede completar: hay datos relacionados.";
  if (e.code === "23514") return "Algún valor está fuera del rango permitido.";
  return e.message;
}

/** Ejecuta una acción devolviendo siempre {error|ok}; nunca lanza al cliente. */
async function run(paths: string[], fn: (c: Awaited<ReturnType<typeof sesion>>) => Promise<string>): Promise<Res> {
  try {
    const out = await fn(await sesion());
    paths.forEach((p) => revalidatePath(p));
    return { ok: out };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues.map((i) => i.message).join("; ") };
    if (e && typeof e === "object" && "message" in e) return { error: msgError(e as { code?: string; message: string }) };
    return { error: "Error inesperado" };
  }
}
const check = (error: { code?: string; message: string } | null) => { if (error) throw error; };

// ---------- maestros (solo administrador): fincas, campañas, parcelas, lotes, cultivos, personal, festivos ----------
const RUTAS_MAESTROS = ["/maestros", "/fincas", "/trabajo", "/cosechas", "/gastos", "/"];

function numeroOpcional(fd: FormData, k: string, etiqueta: string, max = 1_000_000) {
  const v = n(fd, k);
  if (Number.isNaN(v) || (v != null && (v < 0 || v > max))) throw new z.ZodError([{ code: "custom", path: [], message: `${etiqueta} no válido` }]);
  return v;
}

export async function crearFinca(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const p = z.object({
      codigo: z.string().min(1, "Falta el código"), nombre: z.string().min(1, "Falta el nombre"),
      tipo: z.enum(["propia", "arrendada", "terceros"]),
    }).parse({ codigo: s(fd, "codigo") ?? "", nombre: s(fd, "nombre") ?? "", tipo: s(fd, "tipo_explotacion") ?? "propia" });
    const { error } = await db.from("fincas").insert({
      codigo: p.codigo, nombre: p.nombre, tipo_explotacion: p.tipo, superficie_ha: numeroOpcional(fd, "superficie_ha", "La superficie"),
      ubicacion: s(fd, "ubicacion"), observaciones: s(fd, "observaciones"),
    });
    check(error);
    return "Finca creada. Asígnala a los usuarios en «Usuarios».";
  });
}

export async function actualizarFinca(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const nombre = z.string().min(1, "Falta el nombre").parse(s(fd, "nombre") ?? "");
    const { data, error } = await db.from("fincas").update({
      nombre, ubicacion: s(fd, "ubicacion"), superficie_ha: numeroOpcional(fd, "superficie_ha", "La superficie"),
      tipo_explotacion: z.enum(["propia", "arrendada", "terceros"]).parse(s(fd, "tipo_explotacion") ?? "propia"),
      observaciones: s(fd, "observaciones"), activa: fd.get("activa") === "on",
    }).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo actualizar la finca." };
    return "Finca actualizada.";
  });
}

export async function crearParcela(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const p = z.object({ finca_id: z.string().uuid("Elige la finca"), codigo: z.string().min(1, "Falta el código") })
      .parse({ finca_id: s(fd, "finca_id"), codigo: s(fd, "codigo") ?? "" });
    const { error } = await db.from("parcelas").insert({
      ...p, nombre: s(fd, "nombre"), superficie_ha: numeroOpcional(fd, "superficie_ha", "La superficie"),
      estado: s(fd, "estado") ?? "activa", observaciones: s(fd, "observaciones"),
    });
    check(error);
    return "Parcela creada.";
  });
}

export async function actualizarParcela(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("parcelas")
      .update({ nombre: s(fd, "nombre"), superficie_ha: numeroOpcional(fd, "superficie_ha", "La superficie"), estado: s(fd, "estado") ?? "activa", observaciones: s(fd, "observaciones") })
      .eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo actualizar la parcela." };
    return "Parcela actualizada.";
  });
}

// Lotes: subdivisión OPCIONAL de la parcela (finca → parcela → lote)
export async function crearLote(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const p = z.object({ parcela_id: z.string().uuid("Elige la parcela"), codigo: z.string().min(1, "Falta el código del lote") })
      .parse({ parcela_id: s(fd, "parcela_id"), codigo: s(fd, "codigo") ?? "" });
    const { error } = await db.from("lotes").insert({
      ...p, nombre: s(fd, "nombre"), superficie_ha: numeroOpcional(fd, "superficie_ha", "La superficie"),
      estado: s(fd, "estado") ?? "activa", observaciones: s(fd, "observaciones"),
    });
    check(error);
    return "Lote creado.";
  });
}

export async function actualizarLote(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("lotes")
      .update({ nombre: s(fd, "nombre"), superficie_ha: numeroOpcional(fd, "superficie_ha", "La superficie"), estado: s(fd, "estado") ?? "activa", observaciones: s(fd, "observaciones") })
      .eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo actualizar el lote." };
    return "Lote actualizado.";
  });
}

export async function crearCampana(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const p = z.object({ nombre: z.string().min(1, "Falta el nombre"), fecha_inicio: fechaZ })
      .parse({ nombre: s(fd, "nombre") ?? "", fecha_inicio: s(fd, "fecha_inicio") });
    const { error } = await db.from("campanas").insert({ ...p, fecha_fin: s(fd, "fecha_fin") });
    check(error);
    return "Campaña creada.";
  });
}

// ---------- costes generales (solo administrador) ----------
const CATEGORIAS_CG = ["personal_fijo", "amortizacion", "financiero", "seguros", "otros"] as const;
const PERIODOS = ["mensual", "trimestral", "anual", "unico"] as const;

export async function crearCosteGeneral(fd: FormData): Promise<Res> {
  return run([...RUTAS_MAESTROS, "/gastos"], async ({ db }) => {
    await exigirAdmin(db);
    const p = z.object({
      concepto: z.string().min(1, "Falta el concepto"), categoria: z.enum(CATEGORIAS_CG, { message: "Elige la categoría" }),
      periodicidad: z.enum(PERIODOS, { message: "Elige la periodicidad" }), desde: fechaZ,
    }).parse({ concepto: s(fd, "concepto") ?? "", categoria: s(fd, "categoria"), periodicidad: s(fd, "periodicidad"), desde: s(fd, "desde") });
    let hasta = s(fd, "hasta");
    if (hasta && !fechaZ.safeParse(hasta).success) throw { message: "Fecha final no válida" };
    let importe = numeroOpcional(fd, "importe", "El importe", 100_000_000);
    let periodicidad: string = p.periodicidad, valor: number | null = null, anios: number | null = null;
    if (p.categoria === "amortizacion") {
      // amortización lineal: valor ÷ años de vida útil = cuota anual; termina al acabar la vida útil
      valor = numeroOpcional(fd, "valor_adquisicion", "El valor de adquisición", 100_000_000);
      anios = numeroOpcional(fd, "vida_util_anios", "Los años de vida útil", 100);
      if (!valor || !anios) throw { message: "Una amortización necesita el valor de adquisición y los años de vida útil." };
      importe = Math.round((valor / anios) * 100) / 100; periodicidad = "anual";
      const d = new Date(p.desde + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + Math.round(anios * 365) - 1);
      hasta = d.toISOString().slice(0, 10);
    }
    if (importe == null) throw { message: "Falta el importe" };
    if (hasta && hasta < p.desde) throw { message: "La fecha final es anterior a la inicial." };
    const fincaId = s(fd, "finca_id");
    const { error } = await db.from("costes_generales").insert({
      concepto: p.concepto, categoria: p.categoria, periodicidad, desde: p.desde, hasta, importe, valor_adquisicion: valor, vida_util_anios: anios,
      finca_id: fincaId, reparto: s(fd, "reparto") === "iguales" ? "iguales" : "hectareas", observaciones: s(fd, "observaciones"),
    });
    check(error);
    return fincaId ? "Coste de la finca guardado." : "Coste general guardado (se repartirá entre las fincas).";
  });
}

export async function cerrarCosteGeneral(fd: FormData): Promise<Res> {
  return run([...RUTAS_MAESTROS, "/gastos"], async ({ db }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const hasta = fechaZ.parse(s(fd, "hasta") ?? new Date().toISOString().slice(0, 10));
    const { data, error } = await db.from("costes_generales").update({ hasta }).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo dar de baja el coste." };
    return "Coste dado de baja.";
  });
}

export async function eliminarCosteGeneral(fd: FormData): Promise<Res> {
  return run([...RUTAS_MAESTROS, "/gastos"], async ({ db }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("costes_generales").delete().eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo eliminar." };
    return "Coste eliminado (queda en el historial de auditoría).";
  });
}

// ---------- cuenta de resultados: ventas, registros sin factura, proveedores, categoría de los gastos ----------
// Los permisos los impone la base de datos (RLS): registran encargados, responsables y administrador en sus fincas; borrar, solo responsables y administrador.
const RUTAS_RES = ["/resultados", "/gastos", "/maestros"];
const CATEGORIAS_RES = ["insumos", "suministros", "consumibles", "mano_obra", "reparaciones", "otros_gastos", "personal_fijo", "servicios_profesionales", "instalaciones", "gastos_generales", "gastos_financieros"] as const;
const TIPO_A_CATEGORIA: Record<string, string> = { jornal: "mano_obra", nomina: "personal_fijo", prestamo: "gastos_financieros", tributo: "gastos_generales" };

export async function crearVenta(fd: FormData): Promise<Res> {
  return run(RUTAS_RES, async ({ db }) => {
    const p = z.object({ fecha: fechaZ, finca_id: z.string().uuid("Elige la finca") }).parse({ fecha: s(fd, "fecha"), finca_id: s(fd, "finca_id") });
    const importe = numeroOpcional(fd, "importe", "El importe", 100_000_000);
    if (importe == null) throw { message: "Falta el importe (sin IVA)" };
    const { error } = await db.from("ventas").insert({ ...p, importe, cliente: s(fd, "cliente"), numero_factura: s(fd, "numero_factura"), campana_id: s(fd, "campana_id"), observaciones: s(fd, "observaciones") });
    check(error);
    return "Venta registrada.";
  });
}

export async function crearMovimientoResultado(fd: FormData): Promise<Res> {
  return run(RUTAS_RES, async ({ db }) => {
    const p = z.object({
      fecha: fechaZ, finca_id: z.string().uuid("Elige la finca"), tipo: z.enum(["jornal", "nomina", "prestamo", "tributo", "otro"], { message: "Elige el tipo" }),
    }).parse({ fecha: s(fd, "fecha"), finca_id: s(fd, "finca_id"), tipo: s(fd, "tipo") });
    const importe = numeroOpcional(fd, "importe", "El importe", 100_000_000);
    if (importe == null) throw { message: "Falta el importe" };
    const categoria = z.enum(CATEGORIAS_RES).safeParse(s(fd, "categoria") ?? TIPO_A_CATEGORIA[p.tipo]);
    if (!categoria.success) throw { message: "Elige el concepto de la cuenta de resultados" };
    const { error } = await db.from("movimientos_resultado").insert({ ...p, categoria: categoria.data, importe, concepto: s(fd, "concepto"), observaciones: s(fd, "observaciones") });
    check(error);
    return "Registro guardado.";
  });
}

async function borrar(tabla: "ventas" | "movimientos_resultado", fd: FormData, msg: string) {
  return run(RUTAS_RES, async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from(tabla).delete().eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo eliminar (¿no tienes permiso?)." };
    return msg;
  });
}
export const eliminarVenta = async (fd: FormData): Promise<Res> => borrar("ventas", fd, "Venta eliminada (queda en el historial).");
export const eliminarMovimientoResultado = async (fd: FormData): Promise<Res> => borrar("movimientos_resultado", fd, "Registro eliminado (queda en el historial).");

export async function cambiarCategoriaGasto(fd: FormData): Promise<Res> {
  return run(RUTAS_RES, async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const categoria = z.enum(CATEGORIAS_RES, { message: "Categoría no válida" }).parse(s(fd, "categoria"));
    const { data, error } = await db.from("gastos").update({ categoria_resultado: categoria }).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo cambiar (¿no tienes permiso?)." };
    return "Categoría cambiada.";
  });
}

export async function crearProveedor(fd: FormData): Promise<Res> {
  return run(RUTAS_RES, async ({ db }) => {
    await exigirAdmin(db);
    const nombre = z.string().min(1, "Falta el nombre").parse(s(fd, "nombre") ?? "");
    const cat = s(fd, "categoria_defecto");
    if (cat && !CATEGORIAS_RES.includes(cat as any)) throw { message: "Categoría no válida" };
    const { error } = await db.from("proveedores").insert({ nombre, nif: s(fd, "nif"), categoria_defecto: cat });
    check(error);
    return "Proveedor guardado.";
  });
}

export async function actualizarProveedor(fd: FormData): Promise<Res> {
  return run(RUTAS_RES, async ({ db }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const cat = s(fd, "categoria_defecto");
    if (cat && !CATEGORIAS_RES.includes(cat as any)) throw { message: "Categoría no válida" };
    const { data, error } = await db.from("proveedores").update({ categoria_defecto: cat }).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo actualizar." };
    return "Categoría por defecto guardada (afecta a las facturas nuevas).";
  });
}

// ---------- identificadores de finca y empresas propias (para leer facturas) ----------
const TIPOS_IDENT = ["alias", "catastro", "direccion", "cups", "contador", "matricula", "otro"] as const;
const RUTAS_FACT = ["/maestros", "/chat"];

export async function crearIdentificadorFinca(fd: FormData): Promise<Res> {
  return run(RUTAS_FACT, async ({ db }) => {
    await exigirAdmin(db);
    const p = z.object({ finca_id: z.string().uuid("Elige la finca"), tipo: z.enum(TIPOS_IDENT, { message: "Elige el tipo" }), valor: z.string().min(2, "Escribe el identificador") })
      .parse({ finca_id: s(fd, "finca_id"), tipo: s(fd, "tipo"), valor: s(fd, "valor") ?? "" });
    const valor_norm = p.valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (valor_norm.length < 2) throw { message: "El identificador es demasiado corto o no tiene letras ni números." };
    const { error } = await db.from("finca_identificadores").insert({ ...p, valor: p.valor, valor_norm });
    check(error);
    return "Identificador guardado.";
  });
}

export async function eliminarIdentificadorFinca(fd: FormData): Promise<Res> {
  return run(RUTAS_FACT, async ({ db }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("finca_identificadores").delete().eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo eliminar." };
    return "Identificador eliminado.";
  });
}

export async function crearEmpresaPropia(fd: FormData): Promise<Res> {
  return run(RUTAS_FACT, async ({ db }) => {
    await exigirAdmin(db);
    const p = z.object({ nombre: z.string().min(1, "Falta el nombre"), nif: z.string().min(5, "Falta el NIF/CIF") }).parse({ nombre: s(fd, "nombre") ?? "", nif: s(fd, "nif") ?? "" });
    const { error } = await db.from("empresas_propias").insert(p);
    check(error);
    return "Empresa guardada.";
  });
}

export async function eliminarEmpresaPropia(fd: FormData): Promise<Res> {
  return run(RUTAS_FACT, async ({ db }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("empresas_propias").delete().eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo eliminar." };
    return "Empresa eliminada.";
  });
}

// ---------- memoria del chat (administrador): alta manual, baja y reactivación ----------
export async function crearMemoria(fd: FormData): Promise<Res> {
  return run(["/maestros"], async ({ db, uid }) => {
    await exigirAdmin(db);
    const p = z.object({ texto: z.string().trim().min(3, "Escribe la decisión o regla").max(600, "Máximo 600 caracteres"), tipo: z.enum(["decision", "regla", "dato"]) })
      .parse({ texto: s(fd, "texto") ?? "", tipo: s(fd, "tipo") ?? "decision" });
    const { error } = await db.from("memoria_chat").insert({ ...p, finca_id: s(fd, "finca_id"), created_by: uid });
    check(error);
    return "Guardado en la memoria: el chat lo tendrá en cuenta desde la próxima conversación o mensaje.";
  });
}

export async function alternarMemoria(fd: FormData): Promise<Res> {
  return run(["/maestros"], async ({ db }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("memoria_chat").update({ activa: fd.get("activa") === "true", updated_at: new Date().toISOString() }).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo actualizar." };
    return "Memoria actualizada.";
  });
}

// ---------- diario de fincas: retirar una anotación desde la pantalla ----------
export async function retirarNovedad(fd: FormData): Promise<Res> {
  return run(["/diario"], async ({ db, uid }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data: p } = await db.from("profiles").select("rol").eq("id", uid).maybeSingle();
    if (!p?.rol || p.rol === "consulta") throw { message: "Tu rol es de solo consulta." };
    let q = db.from("diario_fincas").update({ activa: false, updated_at: new Date().toISOString() }).eq("id", id).eq("activa", true);
    if (p.rol === "encargado") q = q.eq("created_by", uid); // el encargado solo retira las suyas
    const { data, error } = await q.select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo retirar (¿no es tuya o no tienes permiso?)." };
    return "Anotación retirada (queda en el historial).";
  });
}

// Catálogo de cultivos y variedades
export async function crearCultivoMaestro(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const cultivo = z.string().min(1, "Falta el cultivo").parse(s(fd, "cultivo") ?? "");
    const { error } = await db.from("cultivos_maestro").insert({ cultivo, variedad: s(fd, "variedad") });
    check(error);
    return "Añadido al catálogo.";
  });
}

export async function alternarCultivoMaestro(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("cultivos_maestro").update({ activo: fd.get("activo") === "true" }).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo actualizar." };
    return "Catálogo actualizado.";
  });
}

// Qué se cultiva en cada parcela (y, si procede, en cada lote)
export async function crearCultivo(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const p = z.object({ parcela_id: z.string().uuid("Elige la parcela"), cultivo: z.string().min(1, "Falta el cultivo") })
      .parse({ parcela_id: s(fd, "parcela_id"), cultivo: s(fd, "cultivo") ?? "" });
    const { error } = await db.from("cultivos_parcela").insert({
      ...p, lote_id: s(fd, "lote_id"), variedad: s(fd, "variedad"), campana_id: s(fd, "campana_id"),
      fecha_plantacion: s(fd, "fecha_plantacion"), fecha_prevista_cosecha: s(fd, "fecha_prevista_cosecha"),
    });
    check(error);
    return "Cultivo asignado.";
  });
}

// Personal: tarifas normal / extra / festivo. Las condiciones propias de un trabajador se aplican a sus partes individuales;
// las cuadrillas usan las de su equipo.
function datosPersonal(fd: FormData) {
  return {
    nombre: z.string().min(1, "Falta el nombre").parse(s(fd, "nombre") ?? ""),
    coste_hora: numeroOpcional(fd, "coste_hora", "La tarifa normal", 10_000),
    coste_hora_extra: numeroOpcional(fd, "coste_hora_extra", "La tarifa de horas extra", 10_000),
    coste_hora_festivo: numeroOpcional(fd, "coste_hora_festivo", "La tarifa festiva", 10_000),
    condiciones: s(fd, "condiciones"),
  };
}

/** Ficha del trabajador: código único, teléfono, observaciones y desde cuándo vale la tarifa indicada (hoy si se deja vacío). */
function fichaTrabajador(fd: FormData) {
  const desde = s(fd, "coste_desde");
  return {
    codigo: z.string().trim().min(1, "Falta el código").max(30, "El código es demasiado largo").parse(s(fd, "codigo") ?? ""),
    telefono: s(fd, "telefono"),
    observaciones: s(fd, "observaciones"),
    ...(desde ? { coste_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de inicio de la tarifa no válida").parse(desde) } : {}),
  };
}

export async function crearTrabajador(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const finca_id = z.string().uuid("Elige la finca").parse(s(fd, "finca_id"));
    const { error } = await db.from("trabajadores").insert({ ...datosPersonal(fd), ...fichaTrabajador(fd), finca_id });
    check(error);
    return "Trabajador creado.";
  });
}

export async function actualizarTrabajador(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("trabajadores").update({ ...datosPersonal(fd), ...fichaTrabajador(fd), activo: fd.get("activo") === "on" }).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo actualizar el trabajador." };
    return "Trabajador actualizado. Los partes ya registrados conservan la tarifa con la que se calcularon.";
  });
}

export async function crearEquipo(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const finca_id = z.string().uuid("Elige la finca").parse(s(fd, "finca_id"));
    const { error } = await db.from("equipos").insert({ ...datosPersonal(fd), finca_id });
    check(error);
    return "Equipo creado.";
  });
}

export async function actualizarEquipo(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("equipos").update({ ...datosPersonal(fd), activo: fd.get("activo") === "on" }).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo actualizar el equipo." };
    return "Equipo actualizado. Los partes ya registrados conservan la tarifa con la que se calcularon.";
  });
}

// Festivos: los partes de esos días se calculan con la tarifa festiva
export async function crearFestivo(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const p = z.object({ fecha: fechaZ, nombre: z.string().min(1, "Falta el nombre") }).parse({ fecha: s(fd, "fecha"), nombre: s(fd, "nombre") ?? "" });
    const { error } = await db.from("festivos").insert({ ...p, finca_id: s(fd, "finca_id") });
    check(error);
    return "Festivo añadido.";
  });
}

export async function eliminarFestivo(fd: FormData): Promise<Res> {
  return run(RUTAS_MAESTROS, async ({ db }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("festivos").delete().eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo eliminar el festivo." };
    return "Festivo eliminado.";
  });
}

// ---------- usuarios (solo administrador) ----------
async function exigirAdmin(db: Awaited<ReturnType<typeof sesion>>["db"]) {
  const { data } = await db.rpc("es_admin");
  if (!data) throw { message: "Solo un administrador puede gestionar usuarios." };
}
const ROLES = z.enum(["administrador", "responsable", "encargado", "consulta"]);

export async function crearUsuario(fd: FormData): Promise<Res> {
  return run(["/usuarios"], async ({ db }) => {
    await exigirAdmin(db);
    const p = z.object({
      email: z.string().email("Correo no válido"), nombre: z.string().min(1, "Falta el nombre"),
      password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres"), rol: ROLES,
    }).parse({ email: s(fd, "email"), nombre: s(fd, "nombre") ?? "", password: s(fd, "password") ?? "", rol: s(fd, "rol") });
    const fincas = fd.getAll("fincas").filter((x): x is string => typeof x === "string");

    // Alta en Auth con la clave de servicio (solo en servidor, tras comprobar que es admin)
    const svc = createServiceClient();
    const { data, error } = await svc.auth.admin.createUser({
      email: p.email, password: p.password, email_confirm: true, user_metadata: { nombre: p.nombre },
    });
    if (error) throw { message: /already|registered/i.test(error.message) ? "Ya existe un usuario con ese correo." : error.message };
    const id = data.user.id;
    const { error: e1 } = await svc.from("profiles").update({ rol: p.rol, nombre: p.nombre }).eq("id", id);
    check(e1);
    if (fincas.length) {
      const { error: e2 } = await svc.from("usuarios_fincas").insert(fincas.map((finca_id) => ({ user_id: id, finca_id })));
      check(e2);
    }
    return `Usuario ${p.email} creado. Comunícale la contraseña por un canal seguro.`;
  });
}

export async function actualizarUsuario(fd: FormData): Promise<Res> {
  return run(["/usuarios"], async ({ db, uid }) => {
    await exigirAdmin(db);
    const id = z.string().uuid().parse(s(fd, "id"));
    const rol = ROLES.parse(s(fd, "rol"));
    const activo = fd.get("activo") === "on";
    if (id === uid && (rol !== "administrador" || !activo))
      throw { message: "No puedes quitarte a ti mismo el rol de administrador ni desactivarte." };
    const fincas = fd.getAll("fincas").filter((x): x is string => typeof x === "string");

    const { error } = await db.from("profiles").update({ rol, activo }).eq("id", id);
    check(error);
    const { error: e1 } = await db.from("usuarios_fincas").delete().eq("user_id", id);
    check(e1);
    if (fincas.length) {
      const { error: e2 } = await db.from("usuarios_fincas").insert(fincas.map((finca_id) => ({ user_id: id, finca_id })));
      check(e2);
    }
    return "Usuario actualizado.";
  });
}

// ---------- gastos ----------
const CATEGORIAS = z.enum(["mano_obra", "insumos", "maquinaria", "combustible", "semillas_plantas", "riego_agua", "herramientas", "transporte", "otros"]);
const TIPOS_IMPORTE = z.enum(["registrado", "presupuesto", "estimacion", "prevision"]);

// ---------- documentos ----------

const filaBase = { fecha: fechaZ, parcela_id: z.string().uuid().nullable() };
const FILAS = {
  gasto: z.object({
    ...filaBase, categoria: CATEGORIAS, importe: z.number().min(0), moneda: z.string().length(3),
    tipo_importe: TIPOS_IMPORTE, proveedor: z.string().nullable(), concepto: z.string().nullable(),
    numero_factura: z.string().nullable().optional(), proveedor_nif: z.string().nullable().optional(), iva_importe: z.number().nullable().optional(),
    categoria_resultado: z.string().nullable().optional(),
  }),
  venta: z.object({
    fecha: fechaZ, importe: z.number().min(0), cliente: z.string().nullable(), numero_factura: z.string().nullable(), cliente_nif: z.string().nullable().optional(),
    iva_importe: z.number().nullable().optional(), observaciones: z.string().nullable().optional(),
  }),
  cosecha: z.object({
    ...filaBase, cultivo: z.string().min(1), variedad: z.string().nullable(),
    kg: z.number().positive(), cajas: z.number().int().min(0).nullable(), calidad: z.string().nullable(),
  }),
  parte: z.object({
    ...filaBase, num_trabajadores: z.number().int().positive(), horas_por_trabajador: z.number().positive().max(24),
    actividad: z.string().nullable(),
  }),
};

/** Importa SOLO las filas que el usuario ha revisado y marcado. Cada fila se valida y se inserta con RLS. */
export async function importarRegistros(fd: FormData): Promise<Res> {
  return run(["/chat", "/gastos", "/cosechas", "/trabajo", "/resultados", "/"], async ({ db }) => {
    const documento_id = z.string().uuid().parse(s(fd, "documento_id"));
    const fincaDoc = z.string().uuid().nullable().parse(s(fd, "finca_id"));
    const filas = z.array(z.object({ idx: z.number().int().min(0), tipo: z.enum(["gasto", "venta", "cosecha", "parte"]), finca_id: z.string().uuid().nullable().optional(), datos: z.record(z.any()) }))
      .min(1, "Marca al menos una fila").parse(JSON.parse(s(fd, "filas") ?? "[]"));

    const { data: doc } = await db.from("documentos").select("datos_extraidos,campana_id").eq("id", documento_id).single();
    if (!doc) throw { message: "Documento no encontrado." };
    const ya = new Set<number>(doc.datos_extraidos?.importados ?? []);
    const hechos: number[] = [];
    const fallos: string[] = [];

    const regs: any[] = doc.datos_extraidos?.registros ?? [];
    // nº de línea dentro de su factura (para no duplicar una factura ya registrada)
    const lineaDe = (idx: number) => {
      const r = regs[idx]; if (!r?.numero_factura) return null;
      const mismo = (x: any) => x?.numero_factura === r.numero_factura && (x?.emisor_nif ?? x?.proveedor ?? null) === (r.emisor_nif ?? r.proveedor ?? null);
      return regs.slice(0, idx + 1).filter(mismo).length;
    };
    // ventas de una misma factura y finca: una sola fila con la suma (una factura emitida es única por finca)
    const ventas = new Map<string, { f: (typeof filas)[number]; idxs: number[]; importe: number; iva: number | null }>();
    const resto: typeof filas = [];
    for (const f of filas) {
      if (f.tipo !== "venta") { resto.push(f); continue; }
      const fin = f.finca_id ?? fincaDoc;
      const num = String(f.datos.numero_factura ?? "").trim().toLowerCase();
      const k = num && fin ? `${fin}|${num}` : `solo|${f.idx}`;
      const g = ventas.get(k);
      const imp = Number(f.datos.importe) || 0, iva = f.datos.iva_importe == null ? null : Number(f.datos.iva_importe);
      if (g) { g.idxs.push(f.idx); g.importe += imp; g.iva = g.iva == null || iva == null ? null : g.iva + iva; }
      else ventas.set(k, { f, idxs: [f.idx], importe: imp, iva });
    }
    for (const g of ventas.values()) {
      const idx0 = g.idxs[0];
      if (g.idxs.every((i) => ya.has(i))) { fallos.push(`Fila ${idx0 + 1}: ya importada.`); continue; }
      const fin = g.f.finca_id ?? fincaDoc;
      if (!fin) { fallos.push(`Fila ${idx0 + 1}: elige la finca.`); continue; }
      const v = FILAS.venta.safeParse({ ...g.f.datos, importe: Math.round(g.importe * 100) / 100, iva_importe: g.iva == null ? null : Math.round(g.iva * 100) / 100 });
      if (!v.success) { fallos.push(`Fila ${idx0 + 1}: ${v.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")}`); continue; }
      const { error } = await db.from("ventas").insert({ ...v.data, finca_id: fin, campana_id: doc.campana_id, documento_id });
      if (error) fallos.push(`Fila ${idx0 + 1}: ${msgError(error)}`); else hechos.push(...g.idxs);
    }

    for (const f of resto) {
      if (ya.has(f.idx)) { fallos.push(`Fila ${f.idx + 1}: ya importada.`); continue; }
      const finca_id = f.finca_id ?? fincaDoc;
      if (!finca_id) { fallos.push(`Fila ${f.idx + 1}: elige la finca.`); continue; }
      const v = FILAS[f.tipo as "gasto" | "cosecha" | "parte"].safeParse(f.datos);
      if (!v.success) { fallos.push(`Fila ${f.idx + 1}: ${v.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")}`); continue; }
      const d: any = v.data;
      let error;
      if (f.tipo === "gasto") ({ error } = await db.from("gastos").insert({ ...d, finca_id, campana_id: doc.campana_id, documento_id, linea: lineaDe(f.idx) }));
      else if (f.tipo === "cosecha") ({ error } = await db.from("cosechas").insert({ ...d, finca_id, campana_id: doc.campana_id, origen: "documento" }));
      else ({ error } = await db.from("partes_trabajo").insert({ ...d, finca_id, origen: "documento" }));
      if (error) fallos.push(`Fila ${f.idx + 1}: ${msgError(error)}`);
      else hechos.push(f.idx);
    }

    if (hechos.length) {
      const total = (doc.datos_extraidos?.registros ?? []).length;
      const importados = [...ya, ...hechos];
      await db.from("documentos").update({
        finca_id: fincaDoc, datos_extraidos: { ...doc.datos_extraidos, importados },
        estado: importados.length >= total ? "importado" : "revisado",
      }).eq("id", documento_id);
    }
    if (!hechos.length) throw { message: fallos.join(" | ") };
    return `${hechos.length} registro(s) importado(s).${fallos.length ? ` Con problemas: ${fallos.join(" | ")}` : ""}`;
  });
}

/**
 * Hoja de horas leída de un Excel: crea un parte por cada línea (un trabajador, un día). El usuario solo decide a qué finca va cada nombre de finca
 * de la hoja; las filas se leen del documento guardado (no se aceptan del navegador). Los trabajadores se enlazan por nombre con Maestros → Personal;
 * los que no están dados de alta quedan con su nombre y sin tarifa. Lo ya importado no se repite.
 */
export async function importarHoras(fd: FormData): Promise<Res> {
  return run(["/chat", "/resultados", "/nominas", "/"], async ({ db }) => {
    const documento_id = z.string().uuid().parse(s(fd, "documento_id"));
    const mapa = z.record(z.string().uuid().nullable()).parse(JSON.parse(s(fd, "mapa") ?? "{}"));
    const { data: doc } = await db.from("documentos").select("datos_extraidos").eq("id", documento_id).single();
    if (!doc?.datos_extraidos?.hoja_horas) throw { message: "Este documento no es una hoja de horas." };
    const regs: any[] = doc.datos_extraidos.registros ?? [];
    const ya = new Set<number>(doc.datos_extraidos.importados ?? []);
    const { data: trab } = await db.from("trabajadores").select("id,nombre,finca_id").eq("activo", true);
    const lista = (trab ?? []) as { id: string; nombre: string; finca_id: string | null }[];
    const buscar = (nombre: string, finca: string) => buscarTrabajador(nombre, lista.filter((t) => !t.finca_id || t.finca_id === finca))?.id ?? null;

    const hechos: number[] = [], saltadas: string[] = [], duplicadas: number[] = [], fallos: string[] = [];
    const sinFinca = new Set<string>();
    for (let i = 0; i < regs.length; i++) {
      if (ya.has(i)) continue;
      const r = regs[i];
      const ref = String(r.finca_ref ?? "");
      const finca = mapa[ref];
      if (!finca) { sinFinca.add(ref || "(sin finca)"); continue; }
      if (!r.fecha || !r.trabajador_nombre || !(Number(r.horas) > 0)) { saltadas.push(`${r.hoja} fila ${r.fila}`); continue; }
      const tid = buscar(String(r.trabajador_nombre), finca);
      const { error } = await db.from("partes_trabajo").insert({
        fecha: r.fecha, finca_id: finca, trabajador_id: tid, trabajador_nombre: tid ? null : String(r.trabajador_nombre).slice(0, 120), num_trabajadores: 1,
        horas_por_trabajador: Number(r.horas), horas_extra_por_trabajador: Math.min(Number(r.horas_extra) || 0, Number(r.horas)),
        tipo_trabajo: r.tipo_trabajo ?? null, actividad: r.actividad ? String(r.actividad).slice(0, 500) : null, origen: "documento",
      });
      if (!error) hechos.push(i);
      else if (error.code === "23505") { duplicadas.push(i); }
      else if (fallos.length < 3) fallos.push(`${r.hoja} fila ${r.fila}: ${msgError(error)}`);
      else fallos.push("");
    }

    const nuevos = [...hechos, ...duplicadas];
    if (nuevos.length) {
      const importados = [...ya, ...nuevos];
      await db.from("documentos").update({
        datos_extraidos: { ...doc.datos_extraidos, importados },
        estado: importados.length >= regs.length ? "importado" : "revisado",
      }).eq("id", documento_id);
    }
    if (!hechos.length && !duplicadas.length)
      throw { message: fallos.filter(Boolean).join(" | ") || (sinFinca.size ? `Elige la finca de: ${[...sinFinca].join(", ")}.` : "No había nada que importar.") };
    const partes = [`${hechos.length} línea(s) de horas importada(s)`];
    if (duplicadas.length) partes.push(`${duplicadas.length} ya existían`);
    if (saltadas.length) partes.push(`${saltadas.length} con datos incompletos (${saltadas.slice(0, 3).join(", ")}${saltadas.length > 3 ? "…" : ""})`);
    if (sinFinca.size) partes.push(`pendientes de elegir finca: ${[...sinFinca].join(", ")}`);
    if (fallos.some(Boolean)) partes.push(`con errores: ${fallos.filter(Boolean).join(" | ")}`);
    return partes.join(". ") + ".";
  });
}

/**
 * Registro de horas (como el parte de AppCampo): varios trabajadores, una finca, una fecha y horas por tarea. Crea un parte por trabajador y tarea.
 * Avisa (y no guarda) si alguien pasaría de 12 h ese día, sumando lo ya registrado, salvo que se marque «registrar igualmente».
 */
export async function registrarHoras(fd: FormData): Promise<Res> {
  return run(["/horas", "/chat", "/resultados", "/nominas", "/"], async ({ db }) => {
    const finca_id = z.string().uuid("Elige la finca").parse(s(fd, "finca_id"));
    const fecha = fechaZ.parse(s(fd, "fecha"));
    const ids = z.array(z.string().uuid()).min(1, "Elige al menos un trabajador").max(100).parse(fd.getAll("trabajador").map(String));
    const error = (m: string) => new z.ZodError([{ code: "custom", path: [], message: m }]);
    const obs = s(fd, "actividad")?.slice(0, 400) ?? null;
    const { data: vars } = await db.from("cultivos_maestro").select("id,cultivo,variedad").eq("activo", true);
    const lineas: { tarea: string; h: number; actividad: string | null; kg?: number; cultivo?: string; variedad?: string | null }[] = [];
    for (let i = 0; i < 30; i++) {
      const nombre = s(fd, `l${i}_tarea`);
      if (!nombre) continue;
      const def = TAREAS.find((t) => t.nombre === nombre);
      if (!def) throw error(`Tarea no válida: «${nombre}»`);
      const h = n(fd, `l${i}_horas`);
      if (h == null || Number.isNaN(h) || h <= 0 || h > 24) throw error(`Indica las horas de «${nombre}» (entre 0 y 24)`);
      const sub = s(fd, `l${i}_subtipo`);
      if (def.subtipos && (!sub || !def.subtipos.includes(sub))) throw error(`«${nombre}» necesita un subtipo (${def.subtipos.join(" o ")})`);
      const l: (typeof lineas)[number] = { tarea: nombre, h, actividad: [def.subtipos ? sub : null, obs].filter(Boolean).join(" · ") || null };
      if (def.cosecha) {
        const kg = n(fd, `l${i}_kg`);
        if (kg == null || Number.isNaN(kg) || kg <= 0 || kg > 10_000_000) throw error("Indica los kg cosechados en la tarea Cosecha");
        const v = ((vars ?? []) as any[]).find((x) => x.id === s(fd, `l${i}_variedad`));
        if (!v) throw error("Elige la variedad cosechada (del maestro de cultivos)");
        Object.assign(l, { kg, cultivo: v.cultivo, variedad: v.variedad });
      }
      lineas.push(l);
    }
    if (!lineas.length) throw error("Añade al menos una tarea con sus horas");
    const nuevas = lineas.reduce((a, l) => a + l.h, 0);
    if (nuevas > 24) throw error("Un trabajador no puede tener más de 24 h en un día");

    const { data: previos } = await db.from("partes_trabajo").select("trabajador_id,horas_por_trabajador,num_trabajadores").eq("fecha", fecha).in("trabajador_id", ids);
    const ya = new Map<string, number>();
    for (const p of (previos ?? []) as any[]) ya.set(p.trabajador_id, (ya.get(p.trabajador_id) ?? 0) + Number(p.horas_por_trabajador) * (Number(p.num_trabajadores) || 1));
    const pasan = ids.filter((id) => (ya.get(id) ?? 0) + nuevas > MAX_HORAS_DIA);
    if (pasan.length && fd.get("forzar") !== "on") {
      const { data: nom } = await db.from("trabajadores").select("id,codigo,nombre").in("id", pasan);
      const det = ((nom ?? []) as any[]).map((t) => `${t.codigo ? t.codigo + " " : ""}${t.nombre} (${((ya.get(t.id) ?? 0) + nuevas).toLocaleString("es-ES")} h)`).join(", ");
      throw { message: `Aviso: pasarían de ${MAX_HORAS_DIA} h ese día: ${det}. No se ha guardado nada; revisa las horas o marca «Registrar igualmente».` };
    }

    let hechos = 0, duplicados = 0;
    const fallos: string[] = [];
    for (const tid of ids) for (const l of lineas) {
      const { error } = await db.from("partes_trabajo").insert({
        fecha, finca_id, trabajador_id: tid, num_trabajadores: 1, horas_por_trabajador: l.h, tipo_trabajo: l.tarea, actividad: l.actividad, origen: "manual",
      });
      if (!error) hechos++; else if (error.code === "23505") duplicados++; else if (fallos.length < 2) fallos.push(msgError(error));
    }
    // Cosecha: los kg son de la tarea (no de cada persona), así que se anota una sola cosecha por línea, salvo que ya exista igual
    let cosechas = 0;
    for (const l of lineas.filter((x) => x.kg)) {
      let q = db.from("cosechas").select("id").eq("fecha", fecha).eq("finca_id", finca_id).eq("cultivo", l.cultivo!).eq("kg", l.kg!);
      q = l.variedad ? q.eq("variedad", l.variedad) : q.is("variedad", null);
      const { data: ex } = await q.limit(1);
      if (ex?.length) continue;
      const { error } = await db.from("cosechas").insert({ fecha, finca_id, cultivo: l.cultivo, variedad: l.variedad, kg: l.kg, origen: "manual" });
      if (!error) cosechas++; else if (fallos.length < 2) fallos.push(`cosecha: ${msgError(error)}`);
    }
    if (!hechos && !duplicados) throw { message: fallos[0] ?? "No se pudo guardar." };
    return `${hechos} parte(s) guardado(s) para ${ids.length} trabajador(es)` + (cosechas ? `; ${cosechas} cosecha(s) anotada(s)` : "") + (duplicados ? `; ${duplicados} ya existían` : "") + (fallos.length ? `; con errores: ${fallos.join(" | ")}` : "") + (pasan.length ? ` (aviso: ${pasan.length} pasan de ${MAX_HORAS_DIA} h)` : "") + ".";
  });
}

/** Importa el histórico de producción (kg e ingresos por finca, cultivo y año) de una tabla resumen. Volver a importar actualiza, no duplica. */
export async function importarProduccion(fd: FormData): Promise<Res> {
  return run(["/chat"], async ({ db }) => {
    const documento_id = z.string().uuid().parse(s(fd, "documento_id"));
    const mapa = z.record(z.string().uuid().nullable()).parse(JSON.parse(s(fd, "mapa") ?? "{}"));
    const { data: doc } = await db.from("documentos").select("datos_extraidos").eq("id", documento_id).single();
    if (!doc?.datos_extraidos?.hoja_produccion) throw { message: "Este documento no es una tabla de producción." };
    const regs: any[] = doc.datos_extraidos.registros ?? [];
    const ya = new Set<number>(doc.datos_extraidos.importados ?? []);
    const hechos: number[] = [], sinFinca = new Set<string>(), fallos: string[] = [];
    for (let i = 0; i < regs.length; i++) {
      if (ya.has(i)) continue;
      const r = regs[i];
      const finca = mapa[String(r.finca_ref ?? "")];
      if (!finca) { sinFinca.add(r.finca_ref || "(sin finca)"); continue; }
      const cultivo = String(r.cultivo).trim().slice(0, 120), anio = Number(r.anio);
      // El índice único es por minúsculas, así que se busca el dato existente y se actualiza o se inserta
      const { data: ex } = await db.from("produccion_anual").select("id,cultivo").eq("finca_id", finca).eq("anio", anio).ilike("cultivo", cultivo.replace(/[%_]/g, "\\$&"));
      const previo = (ex ?? []).find((x: any) => String(x.cultivo).trim().toLowerCase() === cultivo.toLowerCase());
      const datos = { kg: r.kg ?? null, importe: r.importe ?? null, documento_id };
      const { error } = previo
        ? await db.from("produccion_anual").update(datos).eq("id", previo.id)
        : await db.from("produccion_anual").insert({ finca_id: finca, cultivo, anio, ...datos });
      if (!error) hechos.push(i); else if (fallos.length < 3) fallos.push(`${cultivo} ${anio}: ${msgError(error)}`);
    }
    if (hechos.length) {
      const importados = [...ya, ...hechos];
      await db.from("documentos").update({
        datos_extraidos: { ...doc.datos_extraidos, importados }, estado: importados.length >= regs.length ? "importado" : "revisado",
      }).eq("id", documento_id);
    }
    if (!hechos.length) throw { message: fallos.join(" | ") || (sinFinca.size ? `Elige la finca de: ${[...sinFinca].join(", ")}.` : "No había nada que importar.") };
    return `${hechos.length} dato(s) de producción guardado(s)` + (sinFinca.size ? `; pendientes de elegir finca: ${[...sinFinca].join(", ")}` : "") + (fallos.length ? `; con errores: ${fallos.join(" | ")}` : "") + ".";
  });
}

/** El usuario indica qué columna es cada dato de un Excel/CSV de facturas; se relee el original (sin IA). */
export async function aplicarMapeoDocumento(fd: FormData): Promise<Res> {
  return run(["/chat"], async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "documento_id"));
    const campos = ["fecha", "tercero", "nif", "numero", "base", "iva", "total", "concepto", "finca", "tipo"] as const;
    const mapeo: Record<string, number> = {};
    for (const c of campos) { const v = s(fd, `col_${c}`); if (v != null && /^\d+$/.test(v)) mapeo[c] = Number(v); }
    const t = s(fd, "tipo_facturas");
    const { aplicarMapeoTabla } = await import("@/lib/documentos/extraer");
    const r = await aplicarMapeoTabla(db, id, mapeo, t === "venta" ? "venta" : t === "gasto" ? "gasto" : null);
    if (!r.ok) throw { message: r.error };
    return `Leídas ${r.n} línea(s). Revísalas abajo.`;
  });
}

export async function descartarDocumento(fd: FormData): Promise<Res> {
  return run(["/chat"], async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("documentos").update({ estado: "descartado" }).eq("id", id).neq("estado", "importado").select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo descartar (¿ya importado o sin permiso?). El archivo original se conserva." };
    return "Extracción descartada; el archivo original se conserva.";
  });
}

// ---------- tareas ----------
export async function crearTarea(fd: FormData): Promise<Res> {
  return run(["/calendario", "/"], async ({ db }) => {
    // La fecha y la semana son opcionales: sin ninguna de las dos, la tarea queda pendiente sin fecha.
    // Con fecha manda la fecha (la semana se deduce); solo con semana queda asignada a esa semana.
    const p = z.object({
      titulo: z.string().min(1, "Falta el título"), fecha: fechaZ.nullable(), semana_inicio: fechaZ.nullable(),
    }).parse({ titulo: s(fd, "titulo") ?? "", fecha: s(fd, "fecha"), semana_inicio: s(fd, "semana") });
    const { error } = await db.from("tareas").insert({
      ...p, semana_inicio: p.fecha ? null : p.semana_inicio, tipo: s(fd, "tipo") ?? "tarea", descripcion: s(fd, "descripcion"),
      finca_id: s(fd, "finca_id"), parcela_id: s(fd, "parcela_id"), asignado_a: s(fd, "asignado_a"),
    });
    check(error);
    return p.fecha ? "Tarea creada con fecha." : p.semana_inicio ? "Tarea asignada a la semana." : "Tarea creada sin fecha (pendiente).";
  });
}

/** Cambia cuándo se hace una tarea: un día concreto, una semana (sin día) o nada (pendiente). */
export async function asignarTarea(fd: FormData): Promise<Res> {
  return run(["/calendario", "/"], async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const modo = z.enum(["dia", "semana", "nada"]).parse(s(fd, "modo"));
    const fecha = modo === "dia" ? fechaZ.parse(s(fd, "fecha")) : null;
    const semana = modo === "semana" ? fechaZ.parse(s(fd, "semana")) : null;
    const { data, error } = await db.from("tareas").update({ fecha, semana_inicio: semana }).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No tienes permiso para modificar esta tarea." };
    return modo === "dia" ? "Día fijado." : modo === "semana" ? "Asignada a la semana." : "Tarea pasada a pendientes.";
  });
}

export async function eliminarTarea(fd: FormData): Promise<Res> {
  return run(["/calendario", "/"], async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("tareas").delete().eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No tienes permiso para eliminar esta tarea." };
    return "Tarea eliminada.";
  });
}

export async function completarTarea(fd: FormData): Promise<Res> {
  return run(["/calendario", "/"], async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("tareas").update({ completada: fd.get("completada") !== "false" }).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No tienes permiso para modificar esta tarea." };
    return "Tarea actualizada.";
  });
}

// ---------- objetivos de producción (se usan en Informes) ----------
export async function crearObjetivo(fd: FormData): Promise<Res> {
  return run(["/informes"], async ({ db }) => {
    const p = z.object({
      finca_id: z.string().uuid("Elige la finca"), periodo: z.enum(["semanal", "mensual"]), kg: z.number().positive("El objetivo debe ser mayor que 0"),
    }).parse({ finca_id: s(fd, "finca_id"), periodo: s(fd, "periodo"), kg: n(fd, "kg_objetivo") ?? NaN });
    const { error } = await db.from("objetivos").insert({ finca_id: p.finca_id, periodo: p.periodo, kg_objetivo: p.kg, parcela_id: s(fd, "parcela_id") });
    check(error);
    return "Objetivo creado.";
  });
}

export async function eliminarObjetivo(fd: FormData): Promise<Res> {
  return run(["/informes"], async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("objetivos").delete().eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No tienes permiso para esta operación." };
    return "Objetivo eliminado.";
  });
}
