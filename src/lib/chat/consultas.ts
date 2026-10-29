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
