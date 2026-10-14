/**
 * Imputación de costes generales a campañas y fincas. Funciones puras (sin base de datos).
 * Devengo diario: mensual = importe×12/365 al día, trimestral = importe×4/365, anual = importe/365.
 * «Único»: todo el importe cae en la fecha «desde» (o repartido entre «desde» y «hasta» si hay fin).
 * Un coste general (sin finca) se reparte entre las fincas activas por hectáreas o a partes iguales.
 */
export type Coste = {
  id: string; concepto: string; categoria: string; finca_id: string | null; reparto: "hectareas" | "iguales";
  importe: number; periodicidad: "mensual" | "trimestral" | "anual" | "unico"; desde: string; hasta: string | null;
};
export type FincaRep = { id: string; nombre: string; superficie_ha: number | null };
export type Imputacion = { coste: Coste; finca_id: string; importe: number };
export type Resultado = {
  lineas: Imputacion[];
  sinRepartir: { coste: Coste; importe: number; motivo: string }[];
  total: number;
};

export const CATEGORIAS_CG: [string, string][] = [
  ["personal_fijo", "Personal fijo"], ["amortizacion", "Amortizaciones"], ["financiero", "Gastos financieros"], ["seguros", "Seguros"], ["otros", "Otros costes generales"],
];
export const PERIODICIDADES: [string, string][] = [["mensual", "Mensual"], ["trimestral", "Trimestral"], ["anual", "Anual"], ["unico", "Importe único"]];

const DIA = 86400000;
const t = (iso: string) => Date.parse(iso + "T00:00:00Z");
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Días naturales (inclusivos) comunes a dos intervalos. */
export function diasComunes(a1: string, a2: string, b1: string, b2: string) {
  const ini = Math.max(t(a1), t(b1)), fin = Math.min(t(a2), t(b2));
  return fin < ini ? 0 : Math.round((fin - ini) / DIA) + 1;
}
const VECES: Record<string, number> = { mensual: 12, trimestral: 4, anual: 1 };

/** Importe del coste que cae dentro de [ini, fin]. */
export function devengado(c: Coste, ini: string, fin: string): number {
  if (c.periodicidad === "unico") {
    if (!c.hasta || c.hasta === c.desde) return c.desde >= ini && c.desde <= fin ? c.importe : 0;
    return (c.importe * diasComunes(c.desde, c.hasta, ini, fin)) / diasComunes(c.desde, c.hasta, c.desde, c.hasta);
  }
  const dias = diasComunes(c.desde, c.hasta ?? "9999-12-31", ini, fin);
  return (c.importe * VECES[c.periodicidad] * dias) / 365;
}

/** Periodo de una campaña: si sigue abierta, se cuenta hasta hoy. */
export function periodoCampana(c: { fecha_inicio: string; fecha_fin: string | null }, hoy = new Date().toISOString().slice(0, 10)) {
  return { ini: c.fecha_inicio, fin: c.fecha_fin ?? (hoy > c.fecha_inicio ? hoy : c.fecha_inicio) };
}

export function imputar(costes: Coste[], fincas: FincaRep[], ini: string, fin: string, soloFinca?: string): Resultado {
  const lineas: Imputacion[] = [], sinRepartir: Resultado["sinRepartir"] = [];
  for (const c of costes) {
    const imp = devengado(c, ini, fin);
    if (imp <= 0) continue;
    if (c.finca_id) {
      if (!soloFinca || soloFinca === c.finca_id) lineas.push({ coste: c, finca_id: c.finca_id, importe: r2(imp) });
      continue;
    }
    if (!fincas.length) { sinRepartir.push({ coste: c, importe: r2(imp), motivo: "No hay fincas activas." }); continue; }
    let pesos: number[];
    if (c.reparto === "hectareas") {
      const falta = fincas.filter((f) => f.superficie_ha == null || Number(f.superficie_ha) <= 0);
      if (falta.length) { sinRepartir.push({ coste: c, importe: r2(imp), motivo: `Falta la superficie (ha) de: ${falta.map((f) => f.nombre).join(", ")}.` }); continue; }
      pesos = fincas.map((f) => Number(f.superficie_ha));
    } else pesos = fincas.map(() => 1);
    const suma = pesos.reduce((a, b) => a + b, 0);
    fincas.forEach((f, i) => { if (!soloFinca || soloFinca === f.id) lineas.push({ coste: c, finca_id: f.id, importe: r2((imp * pesos[i]) / suma) }); });
  }
  const total = r2(lineas.reduce((a, l) => a + l.importe, 0));
  return { lineas, sinRepartir: soloFinca ? [] : sinRepartir, total };
}

export const COLUMNAS_COSTE = "id,concepto,categoria,finca_id,reparto,importe,periodicidad,desde,hasta,observaciones,valor_adquisicion,vida_util_anios,fincas(nombre)";
export const aCoste = (r: any): Coste => ({ ...r, importe: Number(r.importe) });

/** Carga costes, fincas activas y campaña y devuelve la imputación de esa campaña (admin: RLS de costes_generales). */
export async function imputacionCampana(db: any, campanaId: string, soloFinca?: string) {
  const [{ data: camp }, { data: cs, error }, { data: fs }] = await Promise.all([
    db.from("campanas").select("id,nombre,fecha_inicio,fecha_fin").eq("id", campanaId).maybeSingle(),
    db.from("costes_generales").select(COLUMNAS_COSTE),
    db.from("fincas").select("id,nombre,superficie_ha").eq("activa", true).order("nombre"),
  ]);
  if (!camp) return { error: "Campaña no encontrada." } as const;
  if (error) return { error: error.message } as const;
  const { ini, fin } = periodoCampana(camp);
  const costes = ((cs ?? []) as any[]).map(aCoste);
  const fincas = ((fs ?? []) as any[]).map((f) => ({ ...f, superficie_ha: f.superficie_ha == null ? null : Number(f.superficie_ha) })) as FincaRep[];
  return { camp, ini, fin, fincas, ...imputar(costes, fincas, ini, fin, soloFinca) } as const;
}
