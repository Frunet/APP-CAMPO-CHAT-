import type { SupabaseClient } from "@supabase/supabase-js";
import type { TablaExport } from "./informes-export";

/** Consultas compartidas por las pantallas de Trabajo, Cosechas y Gastos y por sus descargas (Excel/PDF). Solo lectura. */
type Db = SupabaseClient;

export const CATEGORIAS: [string, string][] = [
  ["mano_obra", "Mano de obra"], ["insumos", "Insumos y productos agrícolas"], ["maquinaria", "Maquinaria"],
  ["combustible", "Combustible"], ["semillas_plantas", "Semillas y plantas"], ["riego_agua", "Riego y agua"],
  ["herramientas", "Herramientas y equipos"], ["transporte", "Transporte"], ["otros", "Otros gastos"],
];
export const TIPOS_IMPORTE: [string, string][] = [
  ["registrado", "Registrado (gasto real)"], ["presupuesto", "Presupuesto"], ["estimacion", "Estimación"], ["prevision", "Previsión"],
];

export const CAP = 20000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: any[], k: string) => xs.reduce((a, r) => a + Number(r[k] ?? 0), 0);
const dmy = (iso?: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
const uuidOk = (s?: string) => (s && /^[0-9a-f-]{36}$/i.test(s) ? s : undefined);
const fechaOk = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

export type FM = { finca?: string; parcela?: string; campana?: string; categoria?: string; desde?: string; hasta?: string };

export function leerFM(sp: Record<string, string | undefined>): FM {
  return {
    finca: uuidOk(sp.finca), parcela: uuidOk(sp.parcela), campana: uuidOk(sp.campana),
    categoria: CATEGORIAS.some(([v]) => v === sp.categoria) ? sp.categoria : undefined,
    desde: fechaOk(sp.desde), hasta: fechaOk(sp.hasta),
  };
}
/** Los mismos filtros como cadena de consulta (para los enlaces de descarga). */
export const aQuery = (f: FM) => new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

function filtrar(q: any, f: FM, o: { campana?: boolean; fechaCol?: string } = {}) {
  if (f.finca) q = q.eq("finca_id", f.finca);
  if (f.parcela) q = q.eq("parcela_id", f.parcela);
  if (o.campana && f.campana) q = q.eq("campana_id", f.campana);
  if (f.desde) q = q.gte("fecha", f.desde);
  if (f.hasta) q = q.lte("fecha", f.hasta);
  return q;
}

// ---------- Trabajo y horas ----------
export async function datosTrabajo(db: Db, f: FM) {
  const q = filtrar(
    db.from("partes_trabajo")
      .select("id,fecha,num_trabajadores,horas_por_trabajador,horas_totales,coste_hora,coste_total,tipo_trabajo,actividad,origen,observaciones,horas_extra_por_trabajador,horas_extra_totales,festivo,fincas(nombre),parcelas(codigo),lotes(codigo),equipos(nombre),trabajadores(nombre)")
      .order("fecha", { ascending: false }).limit(CAP), f);
  const { data, error } = await q;
  const filas = (data ?? []) as any[];
  const sinTarifa = filas.filter((r) => r.coste_total == null).length;
  const tabla: TablaExport = {
    titulo: "Partes de trabajo",
    columnas: ["Fecha", "Finca", "Parcela", "Lote", "Equipo / trabajador", "Personas", "Horas por persona", "Horas extra (por persona)", "Horas totales", "Festivo", "Tipo de trabajo", "Actividad", "Coste/hora normal", "Coste total", "Origen", "Observaciones"],
    filas: filas.map((r) => [dmy(r.fecha), r.fincas?.nombre ?? "", r.parcelas?.codigo ?? "", r.lotes?.codigo ?? "", r.equipos?.nombre ?? r.trabajadores?.nombre ?? "", r.num_trabajadores,
      Number(r.horas_por_trabajador), Number(r.horas_extra_por_trabajador ?? 0), Number(r.horas_totales), r.festivo ? "Sí" : "No", r.tipo_trabajo ?? "", r.actividad ?? "",
      r.coste_hora == null ? "" : Number(r.coste_hora), r.coste_total == null ? "sin tarifa" : Number(r.coste_total), r.origen ?? "", r.observaciones ?? ""]),
    soloExcel: [10, 12, 14, 15],
  };
  return {
    filas, error: error?.message, n: filas.length, horas: r2(sum(filas, "horas_totales")), horasExtra: r2(sum(filas, "horas_extra_totales")),
    festivos: filas.filter((r) => r.festivo).length, coste: r2(sum(filas, "coste_total")),
    sinTarifa, truncado: filas.length >= CAP, tabla,
  };
}

// ---------- Cosechas ----------
export async function datosCosechas(db: Db, f: FM) {
  const q = filtrar(
    db.from("cosechas")
      .select("id,fecha,cultivo,variedad,kg,cajas,calibre,calidad,destino,observaciones,fincas(nombre),parcelas(codigo),lotes(codigo),campanas(nombre),equipos(nombre)")
      .order("fecha", { ascending: false }).limit(CAP), f, { campana: true });
  const { data, error } = await q;
  const filas = (data ?? []) as any[];
  const porParcela = new Map<string, number>();
  filas.forEach((r) => { const k = `${r.fincas?.nombre} · ${r.parcelas?.codigo}`; porParcela.set(k, (porParcela.get(k) ?? 0) + Number(r.kg)); });
  const tabla: TablaExport = {
    titulo: "Cosechas",
    columnas: ["Fecha", "Finca", "Parcela", "Lote", "Cultivo", "Variedad", "Campaña", "Kg", "Cajas", "Calibre", "Calidad", "Destino", "Equipo", "Observaciones"],
    filas: filas.map((r) => [dmy(r.fecha), r.fincas?.nombre ?? "", r.parcelas?.codigo ?? "", r.lotes?.codigo ?? "", r.cultivo, r.variedad ?? "", r.campanas?.nombre ?? "", Number(r.kg),
      r.cajas ?? "", r.calibre ?? "", r.calidad ?? "", r.destino ?? "", r.equipos?.nombre ?? "", r.observaciones ?? ""]),
    soloExcel: [9, 12, 13],
  };
  return {
    filas, error: error?.message, n: filas.length, kg: r2(sum(filas, "kg")),
    porParcela: [...porParcela].map(([k, v]) => ({ k, v: r2(v) })).sort((a, b) => b.v - a.v),
    truncado: filas.length >= CAP, tabla,
  };
}

// ---------- Gastos y costes ----------
export async function datosGastos(db: Db, f: FM) {
  let gq = filtrar(
    db.from("gastos")
      .select("id,fecha,proveedor,categoria,concepto,importe,moneda,tipo_importe,documento_id,observaciones,fincas(nombre),parcelas(codigo),lotes(codigo),campanas(nombre)")
      .order("fecha", { ascending: false }).limit(CAP), f, { campana: true });
  if (f.categoria) gq = gq.eq("categoria", f.categoria);
  const [{ data, error }, kgRes, labRes] = await Promise.all([
    gq,
    filtrar(db.from("cosechas").select("kg").limit(CAP), f, { campana: true }),
    // los partes no tienen campaña: ese filtro no se aplica a la mano de obra
    filtrar(db.from("partes_trabajo").select("coste_total").limit(CAP), f),
  ]);
  const filas = (data ?? []) as any[];
  const reales = filas.filter((r) => r.tipo_importe === "registrado");
  const monedas = [...new Set(reales.map((r) => r.moneda))];
  const mixta = monedas.length > 1;
  const total = r2(sum(reales, "importe"));
  const noReal = filas.filter((r) => r.tipo_importe !== "registrado");
  const porCat = new Map<string, number>();
  reales.forEach((r) => porCat.set(r.categoria, (porCat.get(r.categoria) ?? 0) + Number(r.importe)));

  // Coste por hectárea: solo si se conoce la superficie de TODO el ámbito consultado
  let ha: number | null = null;
  if (f.parcela) {
    const { data: p } = await db.from("parcelas").select("superficie_ha").eq("id", f.parcela).single();
    ha = p?.superficie_ha ?? null;
  } else {
    let fq = db.from("fincas").select("superficie_ha").eq("activa", true);
    if (f.finca) fq = fq.eq("id", f.finca);
    const { data: fs } = await fq;
    if (fs?.length && fs.every((x: any) => x.superficie_ha != null)) ha = fs.reduce((a: number, x: any) => a + Number(x.superficie_ha), 0);
  }
  const kg = sum((kgRes.data ?? []) as any[], "kg");
  const laboral = r2(sum((labRes.data ?? []) as any[], "coste_total"));
  const nombreCat = Object.fromEntries(CATEGORIAS), nombreTipo = Object.fromEntries(TIPOS_IMPORTE);

  const tabla: TablaExport = {
    titulo: "Gastos",
    columnas: ["Fecha", "Finca", "Parcela", "Lote", "Categoría", "Proveedor", "Concepto", "Importe", "Moneda", "Naturaleza", "Justificante", "Campaña", "Observaciones"],
    filas: filas.map((r) => [dmy(r.fecha), r.fincas?.nombre ?? "", r.parcelas?.codigo ?? "", r.lotes?.codigo ?? "", nombreCat[r.categoria] ?? r.categoria, r.proveedor ?? "", r.concepto ?? "",
      Number(r.importe), r.moneda, nombreTipo[r.tipo_importe] ?? r.tipo_importe, r.documento_id ? "Sí" : "No", r.campanas?.nombre ?? "", r.observaciones ?? ""]),
    soloExcel: [11, 12],
  };
  return {
    filas, error: error?.message, n: filas.length, total, moneda: monedas[0] ?? "EUR", mixta, monedas,
    porCategoria: [...porCat].map(([k, v]) => ({ k, nombre: nombreCat[k] ?? k, v: r2(v) })).sort((a, b) => b.v - a.v),
    noContabilizado: { n: noReal.length, importe: r2(sum(noReal, "importe")) },
    ha, costeHa: ha && !mixta ? r2(total / ha) : null, kg: r2(kg), costeKg: kg > 0 && !mixta ? Math.round((total / kg) * 1000) / 1000 : null,
    laboral, sinJustificar: reales.filter((r) => !r.documento_id).length, truncado: filas.length >= CAP, tabla,
  };
}
