"use server";
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

// ---------- fincas, campañas, parcelas, cultivos ----------
export async function crearFinca(fd: FormData): Promise<Res> {
  return run(["/fincas"], async ({ db }) => {
    const p = z.object({
      codigo: z.string().min(1, "Falta el código"), nombre: z.string().min(1, "Falta el nombre"),
      tipo: z.enum(["propia", "arrendada", "terceros"]),
      sup: z.number().min(0, "Superficie no válida").nullable(),
    }).parse({ codigo: s(fd, "codigo") ?? "", nombre: s(fd, "nombre") ?? "", tipo: s(fd, "tipo_explotacion") ?? "propia", sup: n(fd, "superficie_ha") });
    const { error } = await db.from("fincas").insert({
      codigo: p.codigo, nombre: p.nombre, tipo_explotacion: p.tipo, superficie_ha: p.sup,
      ubicacion: s(fd, "ubicacion"), observaciones: s(fd, "observaciones"),
    });
    check(error);
    return "Finca creada. Asígnala a los usuarios desde «Usuarios».";
  });
}

export async function crearParcela(fd: FormData): Promise<Res> {
  return run(["/fincas"], async ({ db }) => {
    const p = z.object({
      finca_id: z.string().uuid("Elige la finca"), codigo: z.string().min(1, "Falta el código"),
      sup: z.number().min(0, "Superficie no válida").nullable(),
    }).parse({ finca_id: s(fd, "finca_id"), codigo: s(fd, "codigo") ?? "", sup: n(fd, "superficie_ha") });
    const { error } = await db.from("parcelas").insert({
      finca_id: p.finca_id, codigo: p.codigo, nombre: s(fd, "nombre"), superficie_ha: p.sup,
      estado: s(fd, "estado") ?? "activa", observaciones: s(fd, "observaciones"),
    });
    check(error);
    return "Parcela creada.";
  });
}

export async function actualizarParcela(fd: FormData): Promise<Res> {
  return run(["/fincas"], async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const sup = n(fd, "superficie_ha");
    if (Number.isNaN(sup) || (sup != null && sup < 0)) throw new z.ZodError([{ code: "custom", path: [], message: "Superficie no válida" }]);
    const { data, error } = await db.from("parcelas")
      .update({ nombre: s(fd, "nombre"), superficie_ha: sup, estado: s(fd, "estado") ?? "activa", observaciones: s(fd, "observaciones") })
      .eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No tienes permiso para esta operación en esa finca." };
    return "Parcela actualizada.";
  });
}

export async function crearCultivo(fd: FormData): Promise<Res> {
  return run(["/fincas"], async ({ db }) => {
    const p = z.object({ parcela_id: z.string().uuid("Elige la parcela"), cultivo: z.string().min(1, "Falta el cultivo") })
      .parse({ parcela_id: s(fd, "parcela_id"), cultivo: s(fd, "cultivo") ?? "" });
    const { error } = await db.from("cultivos_parcela").insert({
      ...p, variedad: s(fd, "variedad"), campana_id: s(fd, "campana_id"),
      fecha_plantacion: s(fd, "fecha_plantacion"), fecha_prevista_cosecha: s(fd, "fecha_prevista_cosecha"),
    });
    check(error);
    return "Cultivo añadido.";
  });
}

export async function crearCampana(fd: FormData): Promise<Res> {
  return run(["/fincas"], async ({ db }) => {
    const p = z.object({ nombre: z.string().min(1, "Falta el nombre"), fecha_inicio: fechaZ })
      .parse({ nombre: s(fd, "nombre") ?? "", fecha_inicio: s(fd, "fecha_inicio") });
    const { error } = await db.from("campanas").insert({ ...p, fecha_fin: s(fd, "fecha_fin") });
    check(error);
    return "Campaña creada.";
  });
}

// ---------- mano de obra ----------
export async function crearTrabajador(fd: FormData): Promise<Res> {
  return run(["/trabajo"], async ({ db }) => {
    const p = z.object({ nombre: z.string().min(1, "Falta el nombre"), finca_id: z.string().uuid("Elige la finca") })
      .parse({ nombre: s(fd, "nombre") ?? "", finca_id: s(fd, "finca_id") });
    const tarifa = n(fd, "coste_hora");
    if (Number.isNaN(tarifa)) throw new z.ZodError([{ code: "custom", path: [], message: "Tarifa no válida" }]);
    const { error } = await db.from("trabajadores").insert({ ...p, coste_hora: tarifa });
    check(error);
    return "Trabajador creado.";
  });
}

export async function crearEquipo(fd: FormData): Promise<Res> {
  return run(["/trabajo"], async ({ db }) => {
    const p = z.object({ nombre: z.string().min(1, "Falta el nombre"), finca_id: z.string().uuid("Elige la finca") })
      .parse({ nombre: s(fd, "nombre") ?? "", finca_id: s(fd, "finca_id") });
    const tarifa = n(fd, "coste_hora");
    if (Number.isNaN(tarifa)) throw new z.ZodError([{ code: "custom", path: [], message: "Tarifa no válida" }]);
    const { error } = await db.from("equipos").insert({ ...p, coste_hora: tarifa });
    check(error);
    return "Equipo creado.";
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
export async function actualizarDocumento(fd: FormData): Promise<Res> {
  return run(["/documentos"], async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("documentos").update({
      tipo: s(fd, "tipo") ?? "otro", finca_id: s(fd, "finca_id"), parcela_id: s(fd, "parcela_id"),
      campana_id: s(fd, "campana_id"), fecha_documento: s(fd, "fecha_documento"),
    }).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No tienes permiso para modificar este documento." };
    return "Documento actualizado.";
  });
}

const filaBase = { fecha: fechaZ, parcela_id: z.string().uuid().nullable() };
const FILAS = {
  gasto: z.object({
    ...filaBase, categoria: CATEGORIAS, importe: z.number().min(0), moneda: z.string().length(3),
    tipo_importe: TIPOS_IMPORTE, proveedor: z.string().nullable(), concepto: z.string().nullable(),
  }),
  cosecha: z.object({
    ...filaBase, parcela_id: z.string().uuid("Elige la parcela"), cultivo: z.string().min(1), variedad: z.string().nullable(),
    kg: z.number().positive(), cajas: z.number().int().min(0).nullable(), calidad: z.string().nullable(),
  }),
  parte: z.object({
    ...filaBase, num_trabajadores: z.number().int().positive(), horas_por_trabajador: z.number().positive().max(24),
    actividad: z.string().nullable(),
  }),
};

/** Importa SOLO las filas que el usuario ha revisado y marcado. Cada fila se valida y se inserta con RLS. */
export async function importarRegistros(fd: FormData): Promise<Res> {
  return run(["/documentos", "/gastos", "/cosechas", "/trabajo", "/"], async ({ db }) => {
    const documento_id = z.string().uuid().parse(s(fd, "documento_id"));
    const finca_id = z.string().uuid("Elige la finca del documento").parse(s(fd, "finca_id"));
    const filas = z.array(z.object({ idx: z.number().int().min(0), tipo: z.enum(["gasto", "cosecha", "parte"]), datos: z.record(z.any()) }))
      .min(1, "Marca al menos una fila").parse(JSON.parse(s(fd, "filas") ?? "[]"));

    const { data: doc } = await db.from("documentos").select("datos_extraidos,campana_id").eq("id", documento_id).single();
    if (!doc) throw { message: "Documento no encontrado." };
    const ya = new Set<number>(doc.datos_extraidos?.importados ?? []);
    const hechos: number[] = [];
    const fallos: string[] = [];

    for (const f of filas) {
      if (ya.has(f.idx)) { fallos.push(`Fila ${f.idx + 1}: ya importada.`); continue; }
      const v = FILAS[f.tipo].safeParse(f.datos);
      if (!v.success) { fallos.push(`Fila ${f.idx + 1}: ${v.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")}`); continue; }
      const d: any = v.data;
      let error;
      if (f.tipo === "gasto") ({ error } = await db.from("gastos").insert({ ...d, finca_id, campana_id: doc.campana_id, documento_id }));
      else if (f.tipo === "cosecha") ({ error } = await db.from("cosechas").insert({ ...d, finca_id, campana_id: doc.campana_id, origen: "documento" }));
      else ({ error } = await db.from("partes_trabajo").insert({ ...d, finca_id, origen: "documento" }));
      if (error) fallos.push(`Fila ${f.idx + 1}: ${msgError(error)}`);
      else hechos.push(f.idx);
    }

    if (hechos.length) {
      const total = (doc.datos_extraidos?.registros ?? []).length;
      const importados = [...ya, ...hechos];
      await db.from("documentos").update({
        finca_id, datos_extraidos: { ...doc.datos_extraidos, importados },
        estado: importados.length >= total ? "importado" : "revisado",
      }).eq("id", documento_id);
    }
    if (!hechos.length) throw { message: fallos.join(" | ") };
    return `${hechos.length} registro(s) importado(s).${fallos.length ? ` Con problemas: ${fallos.join(" | ")}` : ""}`;
  });
}

export async function descartarDocumento(fd: FormData): Promise<Res> {
  return run(["/documentos"], async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("documentos").update({ estado: "descartado" }).eq("id", id).neq("estado", "importado").select("id");
    check(error);
    if (!data?.length) throw { message: "No se pudo descartar (¿ya importado o sin permiso?). El archivo original se conserva." };
    return "Extracción descartada; el archivo original se conserva.";
  });
}

// ---------- documentos esperados (pendientes de recibir) ----------
export async function crearEsperado(fd: FormData): Promise<Res> {
  return run(["/documentos"], async ({ db }) => {
    const p = z.object({ finca_id: z.string().uuid("Elige la finca"), descripcion: z.string().min(1, "Describe el documento") })
      .parse({ finca_id: s(fd, "finca_id"), descripcion: s(fd, "descripcion") ?? "" });
    const { error } = await db.from("documentos_esperados").insert({ ...p, tipo: s(fd, "tipo") ?? "otro", fecha_esperada: s(fd, "fecha_esperada") });
    check(error);
    return "Documento pendiente anotado.";
  });
}

export async function recibirEsperado(fd: FormData): Promise<Res> {
  return run(["/documentos"], async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const documento_id = z.string().uuid("Elige el documento recibido").parse(s(fd, "documento_id"));
    const { data, error } = await db.from("documentos_esperados")
      .update({ documento_id, recibido_at: new Date().toISOString() }).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No tienes permiso para esta operación en esa finca." };
    return "Marcado como recibido.";
  });
}

// ---------- avisos ----------
export async function cambiarEstadoAviso(fd: FormData): Promise<Res> {
  return run(["/avisos", "/"], async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const estado = z.enum(["leido", "resuelto", "pospuesto", "pendiente"]).parse(s(fd, "estado"));
    const dias = n(fd, "dias");
    const cambios: Record<string, unknown> = { estado, pospuesto_hasta: null };
    if (estado === "pospuesto") {
      if (!dias || dias < 1 || dias > 90) throw new z.ZodError([{ code: "custom", path: [], message: "Indica de 1 a 90 días" }]);
      cambios.pospuesto_hasta = new Date(Date.now() + dias * 864e5).toISOString();
    }
    const { data, error } = await db.from("avisos").update(cambios).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "Aviso no encontrado." };
    return "Aviso actualizado.";
  });
}

const PRIORIDADES = z.enum(["baja", "media", "alta", "critica"]);
const PERIODICIDAD = z.enum(["diaria", "semanal", "mensual"]);

export async function guardarRegla(fd: FormData): Promise<Res> {
  return run(["/avisos"], async ({ db }) => {
    const { TIPOS_REGLA } = await import("@/lib/avisos/tipos");
    const p = z.object({
      tipo: z.string().refine((t) => t in TIPOS_REGLA, "Tipo de aviso no válido"), nombre: z.string().min(1, "Falta el nombre"),
      hora: z.string().regex(/^\d{2}:\d{2}/, "Hora no válida"), periodicidad: PERIODICIDAD, prioridad: PRIORIDADES,
      dia_semana: z.number().int().min(1).max(7), dia_mes: z.number().int().min(1).max(28),
    }).parse({
      tipo: s(fd, "tipo"), nombre: s(fd, "nombre") ?? "", hora: s(fd, "hora"), periodicidad: s(fd, "periodicidad"), prioridad: s(fd, "prioridad"),
      dia_semana: n(fd, "dia_semana") ?? 1, dia_mes: n(fd, "dia_mes") ?? 1,
    });
    const dias = n(fd, "dias");
    if (Number.isNaN(dias) || (dias != null && (dias < 0 || dias > 365))) throw new z.ZodError([{ code: "custom", path: [], message: "Días no válido" }]);
    const parametros = { ...(TIPOS_REGLA[p.tipo].params as object), ...(dias != null ? (p.tipo === "falta_parte" ? { dias_atras: dias } : { dias }) : {}) };
    const row = {
      ...p, hora: p.hora.slice(0, 5), parametros, finca_id: s(fd, "finca_id"), enviar_email: fd.get("enviar_email") === "on",
      destinatarios: fd.getAll("destinatarios").filter((x): x is string => typeof x === "string"),
    };
    const id = s(fd, "id");
    if (id) {
      const { data, error } = await db.from("avisos_reglas").update(row).eq("id", id).select("id");
      check(error);
      if (!data?.length) throw { message: "No tienes permiso para esta operación." };
      return "Regla actualizada.";
    }
    const { error } = await db.from("avisos_reglas").insert(row);
    check(error);
    return "Regla creada.";
  });
}

export async function alternarRegla(fd: FormData): Promise<Res> {
  return run(["/avisos"], async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const activa = fd.get("activa") === "true";
    const { data, error } = await db.from("avisos_reglas").update({ activa }).eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No tienes permiso para esta operación." };
    return activa ? "Regla activada." : "Regla desactivada.";
  });
}

export async function eliminarRegla(fd: FormData): Promise<Res> {
  return run(["/avisos"], async ({ db }) => {
    const id = z.string().uuid().parse(s(fd, "id"));
    const { data, error } = await db.from("avisos_reglas").delete().eq("id", id).select("id");
    check(error);
    if (!data?.length) throw { message: "No tienes permiso para esta operación." };
    return "Regla eliminada.";
  });
}

export async function crearReglasBase(): Promise<Res> {
  return run(["/avisos"], async ({ db }) => {
    const { REGLAS_BASE, TIPOS_REGLA } = await import("@/lib/avisos/tipos");
    const { data: ya } = await db.from("avisos_reglas").select("tipo");
    const existentes = new Set((ya ?? []).map((r) => r.tipo));
    const nuevas = REGLAS_BASE.filter((r) => !existentes.has(r.tipo)).map((r) => ({ ...r, parametros: TIPOS_REGLA[r.tipo].params }));
    if (!nuevas.length) return "Ya existen reglas de todos los tipos recomendados.";
    const { error } = await db.from("avisos_reglas").insert(nuevas);
    check(error);
    return `${nuevas.length} reglas recomendadas creadas (se envían a administradores y responsables de cada finca).`;
  });
}

// ---------- tareas y objetivos ----------
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
  return run(["/calendario", "/avisos", "/"], async ({ db }) => {
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
  return run(["/calendario", "/avisos", "/"], async ({ db }) => {
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

export async function crearObjetivo(fd: FormData): Promise<Res> {
  return run(["/informes", "/avisos"], async ({ db }) => {
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
