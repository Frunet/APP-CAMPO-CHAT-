import * as XLSX from "xlsx";
import { norm } from "./facturas";

/**
 * Hojas de horas (Excel/CSV): una fila por trabajador y día con fecha, nombre, finca, horas y, a menudo, columnas de tipo de trabajo.
 * Se leen EN CÓDIGO, sin IA (son cientos de filas y no hace falta interpretar nada): así no hay límites de tamaño ni inventos.
 * Cada fila se convierte en un registro tipo «parte» con el nombre del trabajador, que luego se revisa por grupos (finca y trabajador).
 */
export type RegistroHoras = {
  tipo: "parte"; fecha: string | null; finca_ref: string | null; trabajador_nombre: string; horas: number | null; horas_extra: number;
  tipo_trabajo: string | null; actividad: string | null; hoja: string; fila: number; dudas: string[];
};
export type HojaHoras = { resumen: string; registros: RegistroHoras[]; hojas: string[]; ignoradas: string[] };

const MAX_FILAS = 5000;
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "").trim().replace(/\s/g, "").replace(",", ".");
  return t !== "" && Number.isFinite(Number(t)) ? Number(t) : null;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Fecha de una celda: número de serie de Excel o texto d/m/aa. Devuelve null si no es una fecha clara. */
export function fechaCelda(v: unknown): { fecha: string | null; duda?: string } {
  if (v instanceof Date) return { fecha: iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()) };
  if (typeof v === "number") {
    const p = XLSX.SSF.parse_date_code(v);
    return p && p.y >= 2000 && p.y < 2100 ? { fecha: iso(p.y, p.m, p.d) } : { fecha: null };
  }
  const t = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return { fecha: iso(+m[1], +m[2], +m[3]) };
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (!m) return { fecha: null };
  const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
  const a = +m[1], b = +m[2];
  if (a > 12 && b <= 12) return { fecha: iso(y, b, a) }; // d/m/a
  if (b > 12 && a <= 12) return { fecha: iso(y, a, b) }; // m/d/a
  if (a === b) return { fecha: iso(y, a, b) };
  return { fecha: iso(y, b, a), duda: `Fecha «${t}» ambigua (día/mes): se ha leído como día/mes. Revísala.` };
}

const corto = (h: string) => h.replace(/\(.*$/, "").trim();

/** ¿Es una hoja de horas? Necesita fecha, nombre y horas (o un total) en la fila de encabezados. */
function cabecera(filas: unknown[][]) {
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const h = filas[i].map((c) => norm(c));
    const col = (re: RegExp) => h.findIndex((x) => re.test(x));
    const fecha = col(/^(fecha|dia)$/), nombre = col(/^(nombre|trabajador|empleado|operario|persona)/);
    const horas = col(/^(total horas|horas|n horas|horas trabajadas)$/);
    const total = h.findIndex((x, j) => x === "total" && j !== horas);
    if (fecha >= 0 && nombre >= 0 && horas >= 0) {
      const finca = col(/^(finca|parcela|lugar|explotacion)/), tareas = col(/^(tareas?|actividad|trabajo|descripcion|observaciones)$/);
      const reservadas = new Set([fecha, nombre, horas, total, finca, tareas]);
      // columnas de tipo de trabajo: entre el nombre/finca y las tareas, con valores numéricos
      const tipos = h.map((_, j) => j).filter((j) => !reservadas.has(j) && String(filas[i][j] ?? "").trim() !== "");
      return { fila: i, fecha, nombre, horas, total, finca, tareas, tipos, nombres: filas[i].map((c) => String(c ?? "").trim()) };
    }
  }
  return null;
}

export function leerHojaHoras(buf: Buffer, nombreArchivo: string): HojaHoras | null {
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(buf, { type: "buffer", raw: true }); } catch { return null; }
  const registros: RegistroHoras[] = [];
  const hojas: string[] = [], ignoradas: string[] = [];
  for (const nombre of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], { header: 1, raw: true, blankrows: false, defval: null });
    const cab = cabecera(filas);
    if (!cab) { ignoradas.push(nombre); continue; }
    hojas.push(nombre);
    for (let i = cab.fila + 1; i < filas.length; i++) {
      const f = filas[i];
      const nom = String(f[cab.nombre] ?? "").replace(/\s+/g, " ").trim();
      const { fecha, duda: dudaFecha } = fechaCelda(f[cab.fecha]);
      if (!nom && !fecha) continue; // fila vacía
      if (/^total/i.test(nom) || /^total/i.test(String(f[cab.fecha] ?? ""))) continue; // totales
      const dudas: string[] = [];
      if (dudaFecha) dudas.push(dudaFecha);
      if (!fecha) dudas.push("Fecha no válida.");
      if (!nom) dudas.push("Falta el nombre del trabajador.");
      const totalHoras = cab.horas >= 0 ? num(f[cab.horas]) : null;
      const totalFinca = cab.total >= 0 ? num(f[cab.total]) : null;
      // «TOTAL» (suma de los tipos de trabajo) es lo imputable a la finca de la fila; «Total horas» puede incluir horas en otras fincas
      const horas = totalFinca != null && totalFinca > 0 ? totalFinca : totalHoras;
      if (horas == null || !(horas > 0)) dudas.push("Sin horas.");
      else if (horas > 24) dudas.push(`${horas} horas en un día: revísalo.`);
      if (totalHoras != null && totalFinca != null && totalFinca > 0 && Math.abs(totalHoras - totalFinca) > 0.01)
        dudas.push(`Total horas (${totalHoras}) distinto del total de tipos de trabajo (${totalFinca}); se usan ${totalFinca} h.`);
      const porTipo = cab.tipos.map((j) => ({ t: corto(cab.nombres[j]), h: num(f[j]) ?? 0 })).filter((x) => x.h > 0).sort((a, b) => b.h - a.h);
      const tareas = cab.tareas >= 0 ? String(f[cab.tareas] ?? "").replace(/\s+/g, " ").trim() : "";
      const extra = /(\d+(?:[.,]\d+)?)\s*h(?:oras?)?\s*extras?/i.exec(tareas);
      let horasExtra = extra ? Number(extra[1].replace(",", ".")) : 0;
      if (horas != null && horasExtra > horas) { dudas.push(`Horas extra (${horasExtra}) mayores que las horas: no se aplican.`); horasExtra = 0; }
      const tipoTrabajo = porTipo[0]?.t ?? null;
      const resto = porTipo.slice(1).map((x) => `${x.t} ${r2(x.h)} h`);
      registros.push({
        tipo: "parte", fecha, finca_ref: cab.finca >= 0 ? String(f[cab.finca] ?? "").trim() || null : null, trabajador_nombre: nom,
        horas: horas == null ? null : r2(horas), horas_extra: r2(horasExtra), tipo_trabajo: tipoTrabajo,
        actividad: [tareas, resto.length ? `(también: ${resto.join(", ")})` : ""].filter(Boolean).join(" ") || null,
        hoja: nombre, fila: i + 1, dudas,
      });
      if (registros.length > MAX_FILAS) return null;
    }
  }
  if (!registros.length) return null;
  const fechas = registros.map((r) => r.fecha).filter(Boolean).sort() as string[];
  const trabajadores = new Set(registros.map((r) => norm(r.trabajador_nombre)));
  const horasTot = r2(registros.reduce((a, r) => a + (r.horas ?? 0), 0));
  return {
    resumen: `Hoja de horas «${nombreArchivo}»: ${registros.length} líneas, ${trabajadores.size} trabajadores, ${horasTot} h${fechas.length ? `, del ${fechas[0]} al ${fechas[fechas.length - 1]}` : ""}.`,
    registros, hojas, ignoradas,
  };
}
