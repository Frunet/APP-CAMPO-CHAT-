import * as XLSX from "xlsx";

/**
 * Tablas resumen de producción por años (Excel/CSV): cabecera con las unidades (kg, €) y los años repetidos por grupo, una fila de finca
 * sin cifras y debajo sus cultivos/variedades con una cifra por año. Se leen EN CÓDIGO, sin IA, y se agrupan en un registro por finca, cultivo y año.
 */
export type RegistroProduccion = {
  tipo: "produccion"; finca_ref: string; cultivo: string; anio: number; kg: number | null; importe: number | null; hoja: string; fila: number; dudas: string[];
};
export type HojaProduccion = { resumen: string; registros: RegistroProduccion[] };

/** Número de una celda: admite 5,627.00 (inglés), 5.627,00 (español) y números reales. */
export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let t = String(v ?? "").trim().replace(/[€\s]|kg/gi, "");
  if (!t || !/^-?[\d.,]+$/.test(t)) return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
const anioDe = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : /^\s*\d{4}\s*$/.test(String(v ?? "")) ? Number(v) : null;
  return n != null && Number.isInteger(n) && n >= 1990 && n <= 2100 ? n : null;
};
const unidadDe = (v: unknown): "kg" | "importe" | null => {
  const t = String(v ?? "").trim().toLowerCase();
  if (/^(kg|kgs|kilos?)\b/.test(t)) return "kg";
  if (/^(€|eur|euros?)\b/.test(t) || t === "€") return "importe";
  return null;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 2 });

export function leerHojaProduccion(buf: Buffer, nombre: string): HojaProduccion | null {
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(buf, { type: "buffer", cellDates: true }); } catch { return null; }
  const mapa = new Map<string, RegistroProduccion>();
  const dudasGen: string[] = [];

  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1, raw: true, defval: null, blankrows: true });
    // Fila de años: al menos dos años y alguno repetido o varios
    const fa = filas.findIndex((f) => f.filter((c) => anioDe(c) != null).length >= 2);
    if (fa < 0) continue;
    const anios = new Map<number, number>();
    filas[fa].forEach((c, i) => { const a = anioDe(c); if (a != null) anios.set(i, a); });
    const cols = [...anios.keys()].sort((a, b) => a - b);
    // Unidad de cada columna: la celda de unidad de las filas de encima (hasta 4) se arrastra a la derecha hasta la siguiente
    const unidad = new Map<number, "kg" | "importe">();
    for (let k = Math.max(0, fa - 4); k < fa; k++) {
      let actual: "kg" | "importe" | null = null;
      const ancho = Math.max(filas[k].length, filas[fa].length);
      for (let i = 0; i < ancho; i++) {
        const u = unidadDe(filas[k][i]);
        if (u) actual = u;
        if (actual && anios.has(i) && !unidad.has(i)) unidad.set(i, actual);
      }
    }
    if (!cols.every((c) => unidad.has(c))) {
      // Sin unidades claras: solo se asume si hay dos bloques idénticos de años (kg y €, en ese orden)
      const aN = cols.map((c) => anios.get(c)!);
      const mitad = aN.length / 2;
      if (Number.isInteger(mitad) && mitad > 0 && aN.slice(0, mitad).join() === aN.slice(mitad).join()) {
        cols.forEach((c, i) => unidad.set(c, i < mitad ? "kg" : "importe"));
        dudasGen.push(`En «${hoja}» no se leen las unidades; se ha supuesto que el primer bloque de años son kg y el segundo €.`);
      } else continue;
    }
    const primera = cols[0];
    let finca = "";
    for (let r = fa + 1; r < filas.length; r++) {
      const f = filas[r];
      const etiqueta = f.slice(0, primera).map((c) => String(c ?? "").trim()).find(Boolean) ?? "";
      if (!etiqueta) continue;
      const vals = cols.map((c) => ({ c, v: numero(f[c]) }));
      const hay = vals.some((x) => x.v != null && x.v !== 0);
      if (!hay) { if (!vals.some((x) => x.v != null)) finca = etiqueta; continue; } // fila de finca (sin cifras)
      if (/^total/i.test(etiqueta)) continue; // los totales se calculan, no se importan
      if (!finca) { dudasGen.push(`«${etiqueta}» (${hoja} fila ${r + 1}) no está bajo ninguna finca y se ha ignorado.`); continue; }
      for (const { c, v } of vals) {
        if (v == null) continue;
        const a = anios.get(c)!, u = unidad.get(c)!;
        const k = `${hoja}|${finca}|${etiqueta.toLowerCase()}|${a}`;
        const reg = mapa.get(k) ?? { tipo: "produccion" as const, finca_ref: finca, cultivo: etiqueta, anio: a, kg: null, importe: null, hoja, fila: r + 1, dudas: [] };
        if (u === "kg") reg.kg = v; else reg.importe = v;
        if (v < 0) reg.dudas.push("Cifra negativa.");
        mapa.set(k, reg);
      }
    }
  }
  const registros = [...mapa.values()];
  if (!registros.length) return null;

  const porAnio = new Map<number, { kg: number; imp: number }>();
  for (const r of registros) { const t = porAnio.get(r.anio) ?? { kg: 0, imp: 0 }; t.kg += r.kg ?? 0; t.imp += r.importe ?? 0; porAnio.set(r.anio, t); }
  const fincas = [...new Set(registros.map((r) => r.finca_ref))];
  const lineas = [...porAnio.entries()].sort((a, b) => a[0] - b[0]).map(([a, t]) => `${a}: ${fmt(r2(t.kg))} kg · ${fmt(r2(t.imp))} €${t.kg ? ` (${fmt(r2(t.imp / t.kg))} €/kg)` : ""}`);
  const resumen = `Tabla de producción por años de «${nombre}»: ${fincas.join(", ")}; ${registros.length} datos (finca, cultivo y año). Totales — ${lineas.join(" | ")}.` + (dudasGen.length ? ` ${dudasGen.join(" ")}` : "");
  return { resumen, registros };
}
