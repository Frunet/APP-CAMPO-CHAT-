import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Consulta (solo lectura) de los datos de base: personal, equipos, proveedores, campañas, cultivos y festivos. Con la RLS de la persona. */
type Ctx = { db: SupabaseClient; userId: string; conversacionId: string };

const ENTIDADES = ["trabajadores", "equipos", "proveedores", "campanas", "cultivos", "festivos"] as const;
const TOPE = 300;

export const herramientasConsultas: Anthropic.Tool[] = [
  {
    name: "consultar_maestros",
    description:
      "Lista datos de base para responder en el chat: trabajadores (nombre, finca, activo y, solo para responsables y administradores, tarifa), equipos, proveedores, campañas, cultivos o festivos. " +
      "Úsalo para «¿qué trabajadores hay?», «¿cuántos están dados de alta?», «¿qué proveedores tengo?»… Las fincas y parcelas se listan con listar_fincas_parcelas.",
    input_schema: {
      type: "object",
      properties: {
        entidad: { type: "string", enum: [...ENTIDADES] },
        buscar: { type: "string", description: "Texto que debe contener el nombre (opcional)" },
        incluir_bajas: { type: "boolean", description: "Incluir los dados de baja (por defecto no)" },
      },
      required: ["entidad"],
    },
  },
];

const r2 = (n: unknown) => (n == null ? null : Math.round(Number(n) * 100) / 100);

export async function consultarMaestros(input: Record<string, any>, ctx: Ctx) {
  const entidad = String(input.entidad ?? "");
  if (!(ENTIDADES as readonly string[]).includes(entidad)) return { error: `Entidad no válida. Opciones: ${ENTIDADES.join(", ")}.` };
  const { db, userId } = ctx;
  const { data: perfil } = await db.from("profiles").select("rol").eq("id", userId).maybeSingle();
  const veTarifas = perfil?.rol === "administrador" || perfil?.rol === "responsable";
  const buscar = String(input.buscar ?? "").trim().toLowerCase();
  const bajas = input.incluir_bajas === true;
  const filtra = <T extends { nombre?: string | null }>(l: T[]) => (buscar ? l.filter((x) => (x.nombre ?? "").toLowerCase().includes(buscar)) : l);

  if (entidad === "trabajadores") {
    const { data, error } = await db.from("trabajadores").select("nombre,activo,coste_hora,coste_hora_extra,coste_hora_festivo,fincas(nombre)").order("nombre").limit(2000);
    if (error) return { error: error.message };
    const l = filtra((data ?? []) as any[]).filter((t) => bajas || t.activo);
    return {
      total: l.length, truncado: l.length > TOPE,
      trabajadores: l.slice(0, TOPE).map((t) => ({
        nombre: t.nombre, finca: t.fincas?.nombre ?? "todas las fincas", ...(bajas ? { activo: t.activo } : {}),
        ...(veTarifas ? { tarifa_normal: r2(t.coste_hora), tarifa_extra: r2(t.coste_hora_extra), tarifa_festivo: r2(t.coste_hora_festivo) } : {}),
      })),
      nota: veTarifas ? "Una tarifa null significa que aún no tiene tarifa puesta." : "Las tarifas no son visibles con tu rol.",
    };
  }
  if (entidad === "equipos") {
    const { data, error } = await db.from("equipos").select("nombre,activo,coste_hora,fincas(nombre)").order("nombre").limit(500);
    if (error) return { error: error.message };
    const l = filtra((data ?? []) as any[]).filter((t) => bajas || t.activo);
    return { total: l.length, equipos: l.map((t) => ({ nombre: t.nombre, finca: t.fincas?.nombre ?? null, ...(veTarifas ? { tarifa: r2(t.coste_hora) } : {}) })) };
  }
  if (entidad === "proveedores") {
    const { data, error } = await db.from("proveedores").select("nombre,nif,categoria_defecto,activo").order("nombre").limit(2000);
    if (error) return { error: error.message };
    const l = filtra((data ?? []) as any[]).filter((t) => bajas || t.activo);
    return { total: l.length, truncado: l.length > TOPE, proveedores: l.slice(0, TOPE).map((p) => ({ nombre: p.nombre, nif: p.nif, categoria_por_defecto: p.categoria_defecto })) };
  }
  if (entidad === "campanas") {
    const { data, error } = await db.from("campanas").select("nombre,fecha_inicio,fecha_fin").order("fecha_inicio", { ascending: false }).limit(100);
    if (error) return { error: error.message };
    return { total: (data ?? []).length, campanas: filtra((data ?? []) as any[]).map((c) => ({ nombre: c.nombre, desde: c.fecha_inicio, hasta: c.fecha_fin ?? "abierta" })) };
  }
  if (entidad === "cultivos") {
    const { data, error } = await db.from("cultivos_maestro").select("cultivo,variedad,activo").order("cultivo").limit(500);
    if (error) return { error: error.message };
    const l = ((data ?? []) as any[]).filter((c) => (bajas || c.activo) && (!buscar || `${c.cultivo} ${c.variedad ?? ""}`.toLowerCase().includes(buscar)));
    return { total: l.length, cultivos: l.map((c) => ({ cultivo: c.cultivo, variedad: c.variedad })) };
  }
  const { data, error } = await db.from("festivos").select("fecha,nombre,fincas(nombre)").order("fecha", { ascending: false }).limit(300);
  if (error) return { error: error.message };
  return { total: (data ?? []).length, festivos: filtra((data ?? []) as any[]).map((f) => ({ fecha: f.fecha, nombre: f.nombre, finca: f.fincas?.nombre ?? "todas" })) };
}

export const herramientasProduccion: Anthropic.Tool[] = [
  {
    name: "consultar_produccion_anual",
    description:
      "Histórico de producción por finca, cultivo/variedad y año (kg e ingresos €), cargado desde tablas resumen. Devuelve los datos y los totales por año y por cultivo, ya calculados (€/kg incluido; los ingresos solo para responsables y administradores). " +
      "Úsalo para «¿cuántos kilos de aguacate Hass en 2022?», «compara 2021 con 2023», «¿qué variedad rinde más €/kg?». No es para cosechas diarias (esas están en consultar_cosechas).",
    input_schema: {
      type: "object",
      properties: {
        finca: { type: "string", description: "Nombre de la finca (opcional)" },
        cultivo: { type: "string", description: "Texto del cultivo o variedad (opcional)" },
        anio: { type: "integer", description: "Un año concreto (opcional)" },
      },
    },
  },
];

export async function consultarProduccionAnual(input: Record<string, any>, ctx: Ctx) {
  const { db, userId } = ctx;
  const { data: perfil } = await db.from("profiles").select("rol").eq("id", userId).maybeSingle();
  const veImporte = perfil?.rol === "administrador" || perfil?.rol === "responsable";
  let q = db.from("produccion_anual").select("cultivo,anio,kg,importe,fincas(nombre)").order("anio").limit(5000);
  if (Number.isInteger(input.anio)) q = q.eq("anio", input.anio);
  const { data, error } = await q;
  if (error) return { error: error.message };
  const f = String(input.finca ?? "").trim().toLowerCase(), c = String(input.cultivo ?? "").trim().toLowerCase();
  const l = ((data ?? []) as any[]).filter((r) => (!f || String(r.fincas?.nombre ?? "").toLowerCase().includes(f)) && (!c || String(r.cultivo).toLowerCase().includes(c)));
  if (!l.length) return { total: 0, nota: "No hay datos de producción anual con ese filtro (puede que aún no se haya cargado la tabla)." };
  const sum = (xs: any[]) => {
    const kg = xs.reduce((a, r) => a + Number(r.kg ?? 0), 0), imp = xs.reduce((a, r) => a + Number(r.importe ?? 0), 0);
    return { kg: r2(kg), ...(veImporte ? { importe: r2(imp), euros_por_kg: kg ? r2(imp / kg) : null } : {}) };
  };
  const agrupa = (clave: (r: any) => string) => {
    const m = new Map<string, any[]>();
    for (const r of l) { const k = clave(r); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
    return [...m.entries()].map(([k, xs]) => ({ clave: k, ...sum(xs) }));
  };
  return {
    total: l.length,
    datos: l.map((r) => ({ finca: r.fincas?.nombre, cultivo: r.cultivo, anio: r.anio, kg: r2(r.kg), ...(veImporte ? { importe: r2(r.importe), euros_por_kg: r.kg && r.importe != null ? r2(r.importe / r.kg) : null } : {}) })),
    totales_por_anio: agrupa((r) => String(r.anio)),
    totales_por_cultivo: agrupa((r) => r.cultivo),
    nota: veImporte ? "Los totales ya están calculados: no los recalcules." : "Los ingresos no son visibles con tu rol.",
  };
}
