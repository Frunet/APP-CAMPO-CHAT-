import type { SupabaseClient } from "@supabase/supabase-js";
import { sumarDias } from "@/lib/tiempo";

export type Filtros = { finca?: string; parcela?: string; campana?: string; cultivo?: string; desde: string; hasta: string };
export type Tabla = { titulo: string; columnas: string[]; filas: (string | number | null)[][] };

const CAP = 20000;
const sum = (xs: any[], k: string) => xs.reduce((a, r) => a + Number(r[k] ?? 0), 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function leerFiltros(sp: Record<string, string | undefined>, hoy = new Date().toISOString().slice(0, 10)): Filtros {
  const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const uuid = (s?: string) => (s && /^[0-9a-f-]{36}$/i.test(s) ? s : undefined);
  return {
    finca: uuid(sp.finca), parcela: uuid(sp.parcela), campana: uuid(sp.campana),
    cultivo: sp.cultivo?.trim().slice(0, 60) || undefined,
    desde: ok(sp.desde) ?? hoy.slice(0, 8) + "01", hasta: ok(sp.hasta) ?? hoy,
  };
}

/**
 * kg por trabajador-hora: SOLO con días-parcela que tienen a la vez cosecha y parte con horas.
 * Así no se mezclan horas de otras labores (poda, riego…) con la producción.
 */
export function rendimientoKgHora(cosechas: any[], partes: any[]) {
  const kg = new Map<string, number>(), h = new Map<string, number>();
  cosechas.forEach((c) => kg.set(`${c.fecha}|${c.parcela_id}`, (kg.get(`${c.fecha}|${c.parcela_id}`) ?? 0) + Number(c.kg)));
  partes.filter((p) => p.parcela_id).forEach((p) => h.set(`${p.fecha}|${p.parcela_id}`, (h.get(`${p.fecha}|${p.parcela_id}`) ?? 0) + Number(p.horas_totales)));
  let k = 0, hh = 0, pares = 0;
  for (const [key, v] of kg) if (h.has(key) && h.get(key)! > 0) { k += v; hh += h.get(key)!; pares++; }
  return hh > 0 ? { valor: r2(k / hh), pares, kg: r2(k), horas: r2(hh) } : null;
}

export async function construirInforme(db: SupabaseClient, f: Filtros) {
  const cos = db.from("cosechas").select("fecha,kg,cultivo,variedad,parcela_id,campana_id,finca_id,parcelas(codigo,superficie_ha),campanas(nombre)").gte("fecha", f.desde).lte("fecha", f.hasta).limit(CAP);
  const par = db.from("partes_trabajo").select("fecha,horas_totales,coste_total,parcela_id,finca_id,parcelas(codigo)").gte("fecha", f.desde).lte("fecha", f.hasta).limit(CAP);
  const gas = db.from("gastos").select("fecha,categoria,importe,moneda,tipo_importe,documento_id,finca_id,parcela_id").gte("fecha", f.desde).lte("fecha", f.hasta).limit(CAP);
  const aplicar = (q: any, campana: boolean, conCultivo = false) => {
    if (f.finca) q = q.eq("finca_id", f.finca);
    if (f.parcela) q = q.eq("parcela_id", f.parcela);
    if (campana && f.campana) q = q.eq("campana_id", f.campana);
    if (conCultivo && f.cultivo) q = q.ilike("cultivo", `%${f.cultivo.replace(/[%,()*]/g, "")}%`);
    return q;
  };
  // Comparativa entre campañas: ignora el rango de fechas
  let cmp = db.from("cosechas").select("kg,campana_id,campanas(nombre)").not("campana_id", "is", null).limit(CAP);
  cmp = aplicar(cmp, false, true);

  let fq = db.from("fincas").select("id,nombre,superficie_ha").eq("activa", true);
  if (f.finca) fq = fq.eq("id", f.finca);

  const [c, p, g, camp, fincas, parcelaSel] = await Promise.all([
    aplicar(cos, true, true), aplicar(par, false), aplicar(gas, true), cmp, fq,
    f.parcela ? db.from("parcelas").select("superficie_ha").eq("id", f.parcela).single() : Promise.resolve({ data: null as any }),
  ]);
  const cosechas = (c.data ?? []) as any[], partes = (p.data ?? []) as any[], gastos = (g.data ?? []) as any[];
  const truncado = [cosechas, partes, gastos].some((x) => x.length >= CAP);

  // Producción
  const agrupa = (rows: any[], clave: (r: any) => string, val: (r: any) => number) => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(clave(r), (m.get(clave(r)) ?? 0) + val(r)));
    return [...m].map(([k, v]) => ({ k, v: r2(v) }));
  };
  const kgTotal = r2(sum(cosechas, "kg"));
  const porDia = agrupa(cosechas, (r) => r.fecha, (r) => Number(r.kg)).sort((a, b) => a.k.localeCompare(b.k));
  const porParcelaRaw = new Map<string, { kg: number; ha: number | null; horas: number }>();
  cosechas.forEach((r) => {
    const k = r.parcelas?.codigo ?? "sin parcela";
    const e = porParcelaRaw.get(k) ?? { kg: 0, ha: r.parcelas?.superficie_ha ?? null, horas: 0 };
    e.kg += Number(r.kg); porParcelaRaw.set(k, e);
  });
  const porParcela = [...porParcelaRaw].map(([k, e]) => ({ k, kg: r2(e.kg), ha: e.ha, kg_ha: e.ha ? r2(e.kg / Number(e.ha)) : null })).sort((a, b) => b.kg - a.kg);
  const porVariedad = agrupa(cosechas, (r) => `${r.cultivo}${r.variedad ? ` ${r.variedad}` : ""}`, (r) => Number(r.kg)).sort((a, b) => b.v - a.v);
  const porCampana = agrupa((camp.data ?? []) as any[], (r) => r.campanas?.nombre ?? "?", (r) => Number(r.kg)).sort((a, b) => a.k.localeCompare(b.k));

  // Mano de obra
  const horas = r2(sum(partes, "horas_totales"));
  const sinTarifa = partes.filter((x) => x.coste_total == null).length;
  const costeLaboral = r2(sum(partes, "coste_total"));
  const horasParcela = agrupa(partes, (r) => r.parcelas?.codigo ?? "sin parcela", (r) => Number(r.horas_totales)).sort((a, b) => b.v - a.v);
  const rend = rendimientoKgHora(cosechas, partes);

  // Costes: solo importes registrados; se exige una única moneda
  const reales = gastos.filter((x) => x.tipo_importe === "registrado");
  const monedas = [...new Set(reales.map((x) => x.moneda))];
  const gastoTotal = monedas.length <= 1 ? r2(sum(reales, "importe")) : null;
  const porCategoria = monedas.length <= 1 ? agrupa(reales, (r) => r.categoria, (r) => Number(r.importe)).sort((a, b) => b.v - a.v) : [];
  const noContab = gastos.filter((x) => x.tipo_importe !== "registrado");

  let ha: number | null = null;
  if (f.parcela) ha = parcelaSel.data?.superficie_ha ?? null;
  else if (fincas.data?.length && fincas.data.every((x: any) => x.superficie_ha != null)) ha = fincas.data.reduce((a: number, x: any) => a + Number(x.superficie_ha), 0);

  const notas: string[] = [];
  if (truncado) notas.push(`Se superó el límite de ${CAP} registros por tabla: las cifras pueden estar incompletas. Acota el periodo.`);
  if (sinTarifa) notas.push(`${sinTarifa} parte(s) sin tarifa: el coste laboral es parcial.`);
  if (!ha) notas.push("Falta la superficie (ha) en el ámbito consultado: no se calcula coste por hectárea.");
  if (monedas.length > 1) notas.push(`Gastos en varias monedas (${monedas.join(", ")}): no se suman.`);
  if (!rend) notas.push("No hay días con cosecha y horas en la misma parcela: no se calcula kg por trabajador-hora.");

  const kpis = {
    kgTotal, horas, costeLaboral: sinTarifa ? null : costeLaboral, costeLaboralParcial: costeLaboral, gastoTotal,
    moneda: monedas[0] ?? "EUR",
    costeHa: gastoTotal != null && ha ? r2(gastoTotal / ha) : null,
    costeKg: gastoTotal != null && kgTotal > 0 ? Math.round((gastoTotal / kgTotal) * 1000) / 1000 : null,
    kgHora: rend?.valor ?? null, ha,
    noContabilizado: { n: noContab.length, importe: r2(sum(noContab, "importe")) },
  };
  const incompletos = {
    partesSinTarifa: sinTarifa,
    cosechasSinCampana: cosechas.filter((x) => !x.campana_id).length,
    gastosSinDocumento: reales.filter((x) => !x.documento_id).length,
  };

  const tablas: Tabla[] = [
    { titulo: "Producción por día (kg)", columnas: ["Fecha", "Kg"], filas: porDia.map((d) => [d.k, d.v]) },
    { titulo: "Producción por parcela", columnas: ["Parcela", "Kg", "Superficie (ha)", "Kg/ha"], filas: porParcela.map((x) => [x.k, x.kg, x.ha, x.kg_ha]) },
    { titulo: "Producción por cultivo y variedad", columnas: ["Cultivo/variedad", "Kg"], filas: porVariedad.map((x) => [x.k, x.v]) },
    { titulo: "Producción por campaña (sin filtro de fechas)", columnas: ["Campaña", "Kg"], filas: porCampana.map((x) => [x.k, x.v]) },
    { titulo: "Horas de mano de obra por parcela", columnas: ["Parcela", "Horas"], filas: horasParcela.map((x) => [x.k, x.v]) },
    { titulo: "Gasto registrado por categoría", columnas: ["Categoría", `Importe (${kpis.moneda})`], filas: porCategoria.map((x) => [x.k, x.v]) },
  ];

  return { filtros: f, kpis, incompletos, notas, porDia, porParcela, porVariedad, porCampana, horasParcela, porCategoria, tablas, rend };
}
export type Informe = Awaited<ReturnType<typeof construirInforme>>;
export { sumarDias };
