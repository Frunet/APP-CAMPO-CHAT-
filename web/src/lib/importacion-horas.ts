import { normalizarPersonal } from "./grupos-personal";
export type LineaImportacion = { clave: string; archivo: string; hoja: string; fila: number; fecha: string; nombre: string; codigo: string; finca: string; mayor: string; tipo_trabajo: string; actividad: string; horas: number; extra: number; error: string };
export const TIPOS_IMPORTACION: Record<string, string> = { Instalaciones: "Instalación", Suelos: "Suelos", "Liado y guiado": "Liado y Guía de Planta", "Otros cuidados de planta": "Otros cuidados planta", Riego: "Riego", Cosecha: "Cosecha/ Recolección", Otros: "Otros", "Revisión finca": "Revisión finca" };
export function nombreComparable(v: string) { return normalizarPersonal(v.replace(/\s*\((lomas|frunet|rio velez|pa[ií])\)\s*$/i, "")).split(" ").sort().join(" "); }
export function horasExcel(v: unknown): number | null {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim(), hm = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (hm) return Number(hm[2]) < 60 ? Number(hm[1]) + Number(hm[2]) / 60 : null;
  const n = Number(s.replace(",", ".")); return Number.isFinite(n) ? n : null;
}
export function fechaExcel(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  const s = String(v ?? "").trim();
  let d = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  let out = d ? `${d[1]}-${d[2]}-${d[3]}` : "";
  if (!out) { d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); if (d) out = `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`; }
  const parsed = new Date(`${out}T12:00:00Z`); return out && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === out ? out : null;
}
export function leerFilasHoras(filas: unknown[][], archivo: string, hoja: string): LineaImportacion[] {
  const head = filas.findIndex((r, i) => i < 20 && r.some((c) => normalizarPersonal(String(c ?? "")) === "fecha") && r.some((c) => /^(nombre|nombre y apellidos|trabajador)$/.test(normalizarPersonal(String(c ?? "")))));
  if (head < 0) throw new Error(`${archivo}, ${hoja}: no encuentro las columnas Fecha y Nombre.`);
  const labels = filas[head].map((v) => normalizarPersonal(String(v ?? "")));
  const col = (rx: RegExp) => labels.findIndex((v) => rx.test(v));
  const f = col(/^fecha$/), n = col(/^(nombre|nombre y apellidos|trabajador)$/), codigo = col(/^codigo$/), finca = col(/^finca/), task = col(/^(tareas|observaciones|actividad)$/);
  if (finca < 0) throw new Error(`${archivo}: falta la columna Finca.`);
  const categorias: [string, number][] = [["Instalaciones", col(/^instalacion/)], ["Suelos", col(/^suelos/)], ["Liado y guiado", col(/^liado/)], ["Otros cuidados de planta", col(/^otros cuidados/)], ["Riego", col(/^riego/)], ["Cosecha", col(/^cosecha/)], ["Otros", col(/^otros$/)], ["Revisión finca", col(/^revision finca/)]];
  const total = col(/^total$/), diario = col(/^(total horas|horas diarias)$/), extra = col(/^(extra|horas extra)$/);
  const out: LineaImportacion[] = [];
  for (let i = head + 1; i < filas.length; i++) {
    const r = filas[i]; if (!r[n] || /^(total general|total)$/i.test(String(r[n]).trim())) continue;
    const fecha = fechaExcel(r[f]), nombre = String(r[n]).trim(), fincaNombre = String(r[finca] ?? "").trim(), actividad = task < 0 ? "" : String(r[task] ?? "").trim();
    const valores = categorias.filter(([, c]) => c >= 0).map(([mayor, c]) => ({ mayor, c, horas: horasExcel(r[c]) }));
    const suma = valores.reduce((s, v) => s + (v.horas ?? 0), 0), control = total >= 0 ? horasExcel(r[total]) : diario >= 0 ? horasExcel(r[diario]) : null;
    let error = !fecha ? "Fecha no válida" : !fincaNombre ? "Falta finca" : valores.some((v) => v.horas == null || v.horas < 0 || v.horas > 24) ? "Horas no válidas" : total >= 0 && control == null ? "TOTAL no válido" : valores.length > 0 && control != null && total >= 0 && Math.abs(control - suma) > 0.01 ? "Las tareas no suman TOTAL" : "";
    if (valores.length === 0) { if (control == null || control <= 0 || control > 24) error = "Faltan horas o columnas de tareas"; valores.push({ mayor: "Otros", c: diario, horas: control }); }
    if (valores.length && suma === 0 && !error && valores.every((v) => !v.horas)) continue;
    const lineas = valores.filter((v) => v.horas && v.horas > 0);
    if (!lineas.length) lineas.push({ mayor: "Otros", c: -1, horas: 0 });
    let restante = extra < 0 ? 0 : horasExcel(r[extra]);
    if (restante == null || restante < 0 || restante > lineas.reduce((s, v) => s + (v.horas ?? 0), 0)) { error ||= "Horas extra no válidas"; restante = 0; }
    const extras = lineas.map(() => 0);
    for (let j = lineas.length - 1; j >= 0; j--) { extras[j] = Math.min(restante, lineas[j].horas ?? 0); restante -= extras[j]; }
    lineas.forEach((v, j) => out.push({ clave: `${archivo}|${hoja}|${i + 1}|${v.c}`, archivo, hoja, fila: i + 1, fecha: fecha ?? "", nombre, codigo: codigo < 0 ? "" : String(r[codigo] ?? "").trim(), finca: fincaNombre, mayor: v.mayor, tipo_trabajo: TIPOS_IMPORTACION[v.mayor], actividad, horas: Math.round((v.horas ?? 0) * 100) / 100, extra: extras[j], error }));
  }
  return out;
}
