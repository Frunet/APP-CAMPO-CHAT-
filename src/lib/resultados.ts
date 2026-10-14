import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { aCoste, COLUMNAS_COSTE, imputar, type FincaRep } from "./costes-generales";
import type { TablaExport } from "./informes-export";

/** Cuenta de resultados por finca. Todo se calcula en cada consulta a partir de las líneas: nada de totales guardados. */
export const GASTO_DIRECTO = ["insumos", "suministros", "consumibles", "mano_obra", "reparaciones", "otros_gastos"] as const;
export const ESTRUCTURA = ["personal_fijo", "servicios_profesionales", "instalaciones", "gastos_generales", "gastos_financieros"] as const;
export const NOMBRES: Record<string, string> = {
  ventas: "Ventas", insumos: "Insumos", suministros: "Suministros", consumibles: "Consumibles", mano_obra: "Mano de obra",
  reparaciones: "Reparaciones y mantenimiento", otros_gastos: "Otros gastos", personal_fijo: "Personal fijo",
  servicios_profesionales: "Servicios profesionales", instalaciones: "Instalaciones", gastos_generales: "Gastos generales", gastos_financieros: "Gastos financieros",
};
export const ORIGENES: Record<string, string> = {
  venta: "Factura emitida", factura_recibida: "Factura recibida", jornal: "Jornal (parte de trabajo)", movimiento: "Registro sin factura", coste_general: "Coste general (prorrateo)",
};
/** Categoría de la cuenta que corresponde a cada categoría de «Costes generales». */
const CG_A_CUENTA: Record<string, string> = { personal_fijo: "personal_fijo", financiero: "gastos_financieros", amortizacion: "instalaciones", seguros: "gastos_generales", otros: "gastos_generales" };

export type Linea = { origen: string; ref_id: string | null; fecha: string | null; finca_id: string; categoria: string; importe: number; texto: string };
export type Importes = Record<string, number>;
export type FilaCuenta = { k: string; nombre: string; tipo: "linea" | "subtotal" | "total"; valor: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const sumaDe = (m: Importes, ks: readonly string[]) => r2(ks.reduce((a, k) => a + (m[k] ?? 0), 0));

/** Estructura fija del informe a partir de importes por categoría. */
export function filasCuenta(m: Importes): FilaCuenta[] {
  const gasto = sumaDe(m, GASTO_DIRECTO), margen = r2((m.ventas ?? 0) - gasto), est = sumaDe(m, ESTRUCTURA);
  const l = (k: string): FilaCuenta => ({ k, nombre: NOMBRES[k], tipo: "linea", valor: r2(m[k] ?? 0) });
  return [
    { ...l("ventas"), nombre: "VENTAS", tipo: "subtotal" },
    ...GASTO_DIRECTO.map(l),
    { k: "total_gasto", nombre: "TOTAL GASTO", tipo: "subtotal", valor: gasto },
    { k: "margen_bruto", nombre: "MARGEN BRUTO", tipo: "total", valor: margen },
    ...ESTRUCTURA.map(l),
    { k: "gastos_estructura", nombre: "GASTOS ESTRUCTURA", tipo: "subtotal", valor: est },
    { k: "resultado", nombre: "RESULTADO", tipo: "total", valor: r2(margen - est) },
  ];
}
export const valorDe = (f: FilaCuenta[], k: string) => f.find((x) => x.k === k)?.valor ?? 0;
export const pct = (a: number, base: number) => (base ? r2((a / base) * 100) : null);
export const variacion = (act: number, ant: number) => ({ eur: r2(act - ant), pct: ant ? r2(((act - ant) / Math.abs(ant)) * 100) : null });

export function agrupar(lineas: Linea[]): Importes {
  const m: Importes = {};
  for (const l of lineas) m[l.categoria] = r2((m[l.categoria] ?? 0) + l.importe);
  return m;
}

// ---------- periodos ----------
export type Periodo = { desde: string; hasta: string; etiqueta: string };
const dmy = (s: string) => s.split("-").reverse().join("/");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
const finMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); // m = 1..12

export function leerPeriodo(sp: Record<string, string | undefined>, campanas: { id: string; nombre: string; fecha_inicio: string; fecha_fin: string | null }[], hoy = new Date().toISOString().slice(0, 10)): { tipo: string; p: Periodo } {
  const tipo = ["mes", "trimestre", "anio", "campana", "rango"].includes(sp.tipo ?? "") ? sp.tipo! : "anio";
  const anio = /^\d{4}$/.test(sp.anio ?? "") ? Number(sp.anio) : Number(hoy.slice(0, 4));
  if (tipo === "mes") {
    const m = /^(\d{4})-(\d{2})$/.exec(sp.mes ?? "") ?? /^(\d{4})-(\d{2})$/.exec(hoy.slice(0, 7))!;
    const a = Number(m[1]), n = Math.min(12, Math.max(1, Number(m[2])));
    return { tipo, p: { desde: `${a}-${String(n).padStart(2, "0")}-01`, hasta: finMes(a, n), etiqueta: `${MESES[n - 1]} de ${a}` } };
  }
  if (tipo === "trimestre") {
    const q = Math.min(4, Math.max(1, Number(sp.trim) || Math.floor((Number(hoy.slice(5, 7)) - 1) / 3) + 1));
    return { tipo, p: { desde: `${anio}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`, hasta: finMes(anio, q * 3), etiqueta: `${q}.º trimestre de ${anio}` } };
  }
  if (tipo === "campana") {
    const c = campanas.find((x) => x.id === sp.campana) ?? campanas[0];
    if (c) return { tipo, p: { desde: c.fecha_inicio, hasta: c.fecha_fin ?? (hoy > c.fecha_inicio ? hoy : c.fecha_inicio), etiqueta: `campaña ${c.nombre}` } };
  }
  if (tipo === "rango") {
    const d = ok(sp.desde) ?? `${anio}-01-01`, h = ok(sp.hasta) ?? hoy;
    if (h >= d) return { tipo, p: { desde: d, hasta: h, etiqueta: `del ${dmy(d)} al ${dmy(h)}` } };
  }
  return { tipo: "anio", p: { desde: `${anio}-01-01`, hasta: `${anio}-12-31`, etiqueta: `año ${anio}` } };
}
/** Mismo periodo un año antes (29 de febrero → 28). */
export function anioAnterior(p: Periodo): Periodo {
  const mover = (s: string) => { const [a, m, d] = s.split("-").map(Number); const x = new Date(Date.UTC(a - 1, m - 1, d)); if (x.getUTCMonth() !== m - 1) x.setUTCDate(0); return x.toISOString().slice(0, 10); };
  return { desde: mover(p.desde), hasta: mover(p.hasta), etiqueta: "mismo periodo del año anterior" };
}

// ---------- datos ----------
/** Lee todas las filas de una consulta paginando (la API limita el tamaño de cada respuesta). */
async function todas(q: (a: number, b: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>) {
  const out: any[] = [];
  for (let a = 0; a < 200000; a += 1000) {
    const { data, error } = await q(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/**
 * Líneas de las fincas indicadas en el periodo. Facturas, jornales y registros se leen con la sesión del usuario (RLS por finca).
 * Los costes generales son solo del administrador: se prorratean aparte y solo se entrega a cada usuario la parte de SUS fincas.
 */
export async function cargarLineas(db: SupabaseClient, fincas: string[], desde: string, hasta: string): Promise<Linea[]> {
  if (!fincas.length) return [];
  const filas = await todas((a, b) =>
    db.from("v_resultado_lineas").select("origen,ref_id,fecha,finca_id,categoria,importe,texto").in("finca_id", fincas).gte("fecha", desde).lte("fecha", hasta).order("fecha").order("ref_id").range(a, b));
  const lineas: Linea[] = filas.map((r) => ({ ...r, importe: Number(r.importe) }));

  const svc = createServiceClient() as SupabaseClient;
  const [{ data: cs }, { data: fs }] = await Promise.all([
    svc.from("costes_generales").select(COLUMNAS_COSTE),
    svc.from("fincas").select("id,nombre,superficie_ha").eq("activa", true).order("nombre"),
  ]);
  const todasFincas = ((fs ?? []) as any[]).map((f) => ({ ...f, superficie_ha: f.superficie_ha == null ? null : Number(f.superficie_ha) })) as FincaRep[];
  const imp = imputar(((cs ?? []) as any[]).map(aCoste), todasFincas, desde, hasta);
  for (const l of imp.lineas) {
    if (!fincas.includes(l.finca_id)) continue;
    lineas.push({ origen: "coste_general", ref_id: null, fecha: null, finca_id: l.finca_id, categoria: CG_A_CUENTA[l.coste.categoria] ?? "gastos_generales", importe: l.importe, texto: l.coste.concepto });
  }
  return lineas;
}

export type Vista = {
  periodo: Periodo; anterior: Periodo; fincas: { id: string; nombre: string }[]; comparativa: boolean;
  actual: Importes; previo: Importes; porFinca: { id: string; nombre: string; filas: FilaCuenta[] }[];
  lineasActual: Linea[]; sinFincaAviso: string[];
};

export async function construirVista(db: SupabaseClient, fincas: { id: string; nombre: string }[], p: Periodo, comparativa: boolean): Promise<Vista> {
  const ant = anioAnterior(p), ids = fincas.map((f) => f.id);
  const [act, prev] = await Promise.all([cargarLineas(db, ids, p.desde, p.hasta), cargarLineas(db, ids, ant.desde, ant.hasta)]);
  const porFinca = fincas.map((f) => ({ id: f.id, nombre: f.nombre, filas: filasCuenta(agrupar(act.filter((l) => l.finca_id === f.id))) }));
  return { periodo: p, anterior: ant, fincas, comparativa, actual: agrupar(act), previo: agrupar(prev), porFinca, lineasActual: act, sinFincaAviso: [] };
}

// ---------- exportación ----------
export function tablaConsolidada(v: Vista): TablaExport {
  const a = filasCuenta(v.actual), b = filasCuenta(v.previo);
  return {
    titulo: "Cuenta de resultados", columnas: ["Concepto", `Importe (${v.periodo.etiqueta})`, "Año anterior", "Variación (€)", "Variación (%)"],
    filas: a.map((f, i) => { const x = variacion(f.valor, b[i].valor); return [f.nombre, f.valor, b[i].valor, x.eur, x.pct == null ? "—" : x.pct]; }),
  };
}
export function tablaComparativa(v: Vista): TablaExport {
  const total = filasCuenta(v.actual);
  const ventas = (f: FilaCuenta[]) => valorDe(f, "ventas");
  const filas: (string | number)[][] = total.map((f, i) => [f.nombre, ...v.porFinca.map((x) => x.filas[i].valor), f.valor]);
  filas.push(["Margen bruto % s/ventas", ...v.porFinca.map((x) => pct(valorDe(x.filas, "margen_bruto"), ventas(x.filas)) ?? "—"), pct(valorDe(total, "margen_bruto"), ventas(total)) ?? "—"]);
  filas.push(["Resultado % s/ventas", ...v.porFinca.map((x) => pct(valorDe(x.filas, "resultado"), ventas(x.filas)) ?? "—"), pct(valorDe(total, "resultado"), ventas(total)) ?? "—"]);
  return { titulo: "Comparativa por finca", columnas: ["Concepto", ...v.porFinca.map((x) => x.nombre), "Total"], filas };
}
export function tablaDetalle(v: Vista, nombresFinca: Map<string, string>): TablaExport {
  return {
    titulo: "Detalle", columnas: ["Fecha", "Finca", "Concepto", "Origen", "Descripción", "Importe"],
    filas: [...v.lineasActual].sort((x, y) => (x.categoria + (x.fecha ?? "")).localeCompare(y.categoria + (y.fecha ?? "")))
      .map((l) => [l.fecha ? dmy(l.fecha) : "prorrateo", nombresFinca.get(l.finca_id) ?? "", NOMBRES[l.categoria] ?? l.categoria, ORIGENES[l.origen] ?? l.origen, l.texto, l.importe]),
  };
}

// ---------- parámetros de la consulta (los usan la pantalla y la descarga) ----------
export type Consulta = { tipo: string; periodo: Periodo; fincas: { id: string; nombre: string }[]; comparativa: boolean; detalle?: string; qs: string };
export const planos = (sp: Record<string, string | string[] | undefined>) =>
  Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v])) as Record<string, string | undefined>;

/** `permitidas` son las fincas que la RLS deja ver al usuario: nunca se puede pedir otra. */
export function leerConsulta(sp0: Record<string, string | string[] | undefined>, permitidas: { id: string; nombre: string }[],
  campanas: { id: string; nombre: string; fecha_inicio: string; fecha_fin: string | null }[]): Consulta {
  const sp = planos(sp0);
  const { tipo, p } = leerPeriodo(sp, campanas);
  const pedidas = (sp.finca ?? "").split(",").filter(Boolean);
  const sel = pedidas.length ? permitidas.filter((f) => pedidas.includes(f.id)) : permitidas;
  const fincas = sel.length ? sel : permitidas;
  const detalle = sp.detalle && NOMBRES[sp.detalle] ? sp.detalle : undefined;
  const q = new URLSearchParams();
  for (const k of ["tipo", "mes", "anio", "trim", "campana", "desde", "hasta"]) if (sp[k]) q.set(k, sp[k]!);
  if (pedidas.length) q.set("finca", fincas.map((f) => f.id).join(","));
  if (sp.vista === "comparativa") q.set("vista", "comparativa");
  return { tipo, periodo: p, fincas, comparativa: sp.vista === "comparativa" && fincas.length > 1, detalle, qs: q.toString() };
}
