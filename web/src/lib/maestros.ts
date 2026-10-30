import { db, SUPABASE_KEY, SUPABASE_URL } from "../supabase";
import { check, n, opcional, s, uuid } from "../forms";

// Maestros: solo el administrador los modifica (lo garantizan las reglas RLS de la base de datos).
const fechaOk = (v: string | null, msg: string) => { if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(msg); return v; };
const requerido = (v: string | null, msg: string) => { if (!v) throw new Error(msg); return v; };
const actualizado = (data: unknown[] | null, msg: string) => { if (!data?.length) throw new Error(msg); };
const TIPOS = ["propia", "arrendada", "terceros"];

// ---------- fincas, campañas, parcelas, lotes ----------
export async function crearFinca(fd: FormData) {
  const tipo = s(fd, "tipo_explotacion") ?? "propia";
  if (!TIPOS.includes(tipo)) throw new Error("Tipo de explotación no válido");
  const { error } = await db.from("fincas").insert({ codigo: requerido(s(fd, "codigo"), "Falta el código"), nombre: requerido(s(fd, "nombre"), "Falta el nombre"), tipo_explotacion: tipo, superficie_ha: opcional(fd, "superficie_ha", "La superficie"), ubicacion: s(fd, "ubicacion"), observaciones: s(fd, "observaciones") });
  check(error);
  return "Finca creada. Asígnala a los usuarios en «Usuarios».";
}
export async function actualizarFinca(fd: FormData) {
  const tipo = s(fd, "tipo_explotacion") ?? "propia";
  if (!TIPOS.includes(tipo)) throw new Error("Tipo de explotación no válido");
  const { data, error } = await db.from("fincas").update({ nombre: requerido(s(fd, "nombre"), "Falta el nombre"), ubicacion: s(fd, "ubicacion"), superficie_ha: opcional(fd, "superficie_ha", "La superficie"), tipo_explotacion: tipo, observaciones: s(fd, "observaciones"), activa: fd.get("activa") === "on" }).eq("id", uuid(s(fd, "id"), "Finca no válida")).select("id");
  check(error); actualizado(data, "No se pudo actualizar la finca.");
  return "Finca actualizada.";
}
export async function crearParcela(fd: FormData) {
  const { error } = await db.from("parcelas").insert({ finca_id: uuid(s(fd, "finca_id"), "Elige la finca"), codigo: requerido(s(fd, "codigo"), "Falta el código"), nombre: s(fd, "nombre"), superficie_ha: opcional(fd, "superficie_ha", "La superficie"), estado: s(fd, "estado") ?? "activa", observaciones: s(fd, "observaciones") });
  check(error);
  return "Parcela creada.";
}
export async function actualizarParcela(fd: FormData) {
  const { data, error } = await db.from("parcelas").update({ nombre: s(fd, "nombre"), superficie_ha: opcional(fd, "superficie_ha", "La superficie"), estado: s(fd, "estado") ?? "activa", observaciones: s(fd, "observaciones") }).eq("id", uuid(s(fd, "id"), "Parcela no válida")).select("id");
  check(error); actualizado(data, "No se pudo actualizar la parcela.");
  return "Parcela actualizada.";
}
export async function crearLote(fd: FormData) {
  const { error } = await db.from("lotes").insert({ parcela_id: uuid(s(fd, "parcela_id"), "Elige la parcela"), codigo: requerido(s(fd, "codigo"), "Falta el código del lote"), nombre: s(fd, "nombre"), superficie_ha: opcional(fd, "superficie_ha", "La superficie"), estado: s(fd, "estado") ?? "activa", observaciones: s(fd, "observaciones") });
  check(error);
  return "Lote creado.";
}
export async function actualizarLote(fd: FormData) {
  const { data, error } = await db.from("lotes").update({ nombre: s(fd, "nombre"), superficie_ha: opcional(fd, "superficie_ha", "La superficie"), estado: s(fd, "estado") ?? "activa", observaciones: s(fd, "observaciones") }).eq("id", uuid(s(fd, "id"), "Lote no válido")).select("id");
  check(error); actualizado(data, "No se pudo actualizar el lote.");
  return "Lote actualizado.";
}
export async function crearCampana(fd: FormData) {
  const { error } = await db.from("campanas").insert({ nombre: requerido(s(fd, "nombre"), "Falta el nombre"), fecha_inicio: fechaOk(s(fd, "fecha_inicio"), "Fecha de inicio no válida"), fecha_fin: s(fd, "fecha_fin") });
  check(error);
  return "Campaña creada.";
}

// ---------- cultivos ----------
export async function crearCultivoMaestro(fd: FormData) {
  const { error } = await db.from("cultivos_maestro").insert({ cultivo: requerido(s(fd, "cultivo"), "Falta el cultivo"), variedad: s(fd, "variedad") });
  check(error);
  return "Añadido al catálogo.";
}
export async function alternarCultivoMaestro(fd: FormData) {
  const { data, error } = await db.from("cultivos_maestro").update({ activo: fd.get("activo") === "true" }).eq("id", uuid(s(fd, "id"), "Cultivo no válido")).select("id");
  check(error); actualizado(data, "No se pudo actualizar.");
  return "Catálogo actualizado.";
}
export async function crearCultivo(fd: FormData) {
  const { error } = await db.from("cultivos_parcela").insert({
    parcela_id: uuid(s(fd, "parcela_id"), "Elige la parcela"), cultivo: requerido(s(fd, "cultivo"), "Falta el cultivo"), lote_id: s(fd, "lote_id"), variedad: s(fd, "variedad"),
    campana_id: s(fd, "campana_id"), fecha_plantacion: s(fd, "fecha_plantacion"), fecha_prevista_cosecha: s(fd, "fecha_prevista_cosecha"),
  });
  check(error);
  return "Cultivo asignado.";
}

// ---------- personal: tarifas normal / extra / festivo ----------
function datosPersonal(fd: FormData) {
  return {
    nombre: requerido(s(fd, "nombre"), "Falta el nombre"),
    coste_hora: opcional(fd, "coste_hora", "La tarifa normal", 10_000), coste_hora_extra: opcional(fd, "coste_hora_extra", "La tarifa de horas extra", 10_000),
    coste_hora_festivo: opcional(fd, "coste_hora_festivo", "La tarifa festiva", 10_000), condiciones: s(fd, "condiciones"),
  };
}
/** Ficha del trabajador: código único, teléfono, observaciones y desde cuándo vale la tarifa indicada (hoy si se deja vacío). */
function fichaTrabajador(fd: FormData) {
  const codigo = requerido(s(fd, "codigo"), "Falta el código");
  if (codigo.length > 30) throw new Error("El código es demasiado largo");
  const desde = s(fd, "coste_desde");
  return { codigo, telefono: s(fd, "telefono"), observaciones: s(fd, "observaciones"), ...(desde ? { coste_desde: fechaOk(desde, "Fecha de inicio de la tarifa no válida") } : {}) };
}
export async function crearTrabajador(fd: FormData) {
  const { error } = await db.from("trabajadores").insert({ ...datosPersonal(fd), ...fichaTrabajador(fd), finca_id: uuid(s(fd, "finca_id"), "Elige la finca") });
  check(error);
  return "Trabajador creado.";
}
export async function actualizarTrabajador(fd: FormData) {
  const { data, error } = await db.from("trabajadores").update({ ...datosPersonal(fd), ...fichaTrabajador(fd), activo: fd.get("activo") === "on" }).eq("id", uuid(s(fd, "id"), "Trabajador no válido")).select("id");
  check(error); actualizado(data, "No se pudo actualizar el trabajador.");
  return "Trabajador actualizado. Los partes ya registrados conservan la tarifa con la que se calcularon.";
}
export async function crearEquipo(fd: FormData) {
  const { error } = await db.from("equipos").insert({ ...datosPersonal(fd), finca_id: uuid(s(fd, "finca_id"), "Elige la finca") });
  check(error);
  return "Equipo creado.";
}
export async function actualizarEquipo(fd: FormData) {
  const { data, error } = await db.from("equipos").update({ ...datosPersonal(fd), activo: fd.get("activo") === "on" }).eq("id", uuid(s(fd, "id"), "Equipo no válido")).select("id");
  check(error); actualizado(data, "No se pudo actualizar el equipo.");
  return "Equipo actualizado. Los partes ya registrados conservan la tarifa con la que se calcularon.";
}
export async function crearFestivo(fd: FormData) {
  const { error } = await db.from("festivos").insert({ fecha: fechaOk(s(fd, "fecha"), "Fecha no válida"), nombre: requerido(s(fd, "nombre"), "Falta el nombre"), finca_id: s(fd, "finca_id") });
  check(error);
  return "Festivo añadido.";
}
export async function eliminarFestivo(fd: FormData) {
  const { data, error } = await db.from("festivos").delete().eq("id", uuid(s(fd, "id"), "Festivo no válido")).select("id");
  check(error); actualizado(data, "No se pudo eliminar el festivo.");
  return "Festivo eliminado.";
}

// ---------- usuarios ----------
const ROLES = ["administrador", "responsable", "encargado", "consulta"];
/** Alta y cambio de contraseña pasan por una función de servidor (Supabase Edge Function): necesitan la clave secreta, que nunca llega al navegador. */
async function usuariosAdmin(cuerpo: Record<string, unknown>): Promise<string> {
  const { data: { session } } = await db.auth.getSession();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/usuarios-admin`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${session?.access_token ?? ""}` }, body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error ?? `Error ${r.status}`);
  return j.ok;
}
export async function crearUsuario(fd: FormData) {
  return usuariosAdmin({ accion: "crear", email: s(fd, "email"), nombre: s(fd, "nombre"), password: fd.get("password"), rol: s(fd, "rol"), fincas: fd.getAll("fincas") });
}
export async function cambiarPassword(fd: FormData) {
  return usuariosAdmin({ accion: "password", id: s(fd, "id"), password: fd.get("password") });
}
export async function actualizarUsuario(fd: FormData, yo: string) {
  const id = uuid(s(fd, "id"), "Usuario no válido"), rol = s(fd, "rol") ?? "";
  if (!ROLES.includes(rol)) throw new Error("Rol no válido");
  const activo = fd.get("activo") === "on";
  if (id === yo && (rol !== "administrador" || !activo)) throw new Error("No puedes quitarte a ti mismo el rol de administrador ni desactivarte.");
  const fincas = fd.getAll("fincas").map(String);
  check((await db.from("profiles").update({ rol, activo }).eq("id", id)).error);
  check((await db.from("usuarios_fincas").delete().eq("user_id", id)).error);
  if (fincas.length) check((await db.from("usuarios_fincas").insert(fincas.map((finca_id) => ({ user_id: id, finca_id })))).error);
  return "Usuario actualizado.";
}
export { n };

/** Elimina un trabajador (la base de datos lo hace en bloque). Sus partes de horas se conservan a su nombre, sin ficha; devuelve cuántos. */
export async function eliminarTrabajador(id: string): Promise<number> {
  const { data, error } = await db.rpc("eliminar_trabajador", { p_id: uuid(id, "Trabajador no válido") });
  check(error);
  return Number(data ?? 0);
}
