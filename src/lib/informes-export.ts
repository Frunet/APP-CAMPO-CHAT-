import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import * as XLSX from "xlsx";
import type { Informe, Tabla } from "./informes";

const num = (n: number | null | undefined, d = 2) => (n == null ? "—" : n.toLocaleString("es-ES", { maximumFractionDigits: d }));

/** Tabla exportable; `soloExcel` = índices de columnas que van en el Excel pero no en el PDF (para que el PDF quepa). */
export type TablaExport = Tabla & { soloExcel?: number[] };
export type Doc = {
  titulo: string; resumen: (string | number)[][]; notas: string[]; tablas: TablaExport[];
  horizontal?: boolean; maxFilasPdf?: number;
};

export function excelDeDoc(d: Doc): Buffer {
  const wb = XLSX.utils.book_new();
  const res = [[d.titulo], [], ...d.resumen, ...(d.notas.length ? [[], ["Notas"], ...d.notas.map((n) => [n])] : [])];
  const hojaRes = XLSX.utils.aoa_to_sheet(res);
  hojaRes["!cols"] = [{ wch: 44 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, hojaRes, "Resumen");
  const usados = new Set<string>(["Resumen"]);
  for (const t of d.tablas) {
    const ws = XLSX.utils.aoa_to_sheet([t.columnas, ...t.filas]);
    ws["!cols"] = t.columnas.map((c, i) => ({
      wch: Math.min(40, Math.max(12, c.length + 2, ...t.filas.slice(0, 50).map((f) => String(f[i] ?? "").length + 2))),
    }));
    let nombre = t.titulo.replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Datos";
    for (let k = 2; usados.has(nombre); k++) nombre = `${nombre.slice(0, 28)} ${k}`;
    usados.add(nombre);
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// WinAnsi (fuente estándar del PDF) cubre acentos, ñ y €; lo demás se sustituye
const limpia = (s: string) => s.replace(/[^\x20-\x7E -ÿ€]/g, "?");

export async function pdfDeDoc(d: Doc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = d.horizontal ? [842, 595] : [595, 842];
  const M = 40;
  const maxFilas = d.maxFilasPdf ?? 200;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const nueva = () => { page = pdf.addPage([W, H]); y = H - M; };
  const salto = (alto: number) => { if (y - alto < M) nueva(); };
  const texto = (t: string, x: number, size: number, f: PDFFont = font, color = rgb(0.1, 0.1, 0.1)) =>
    page.drawText(limpia(t), { x, y, size, font: f, color });
  const parrafo = (t: string, size = 9, f: PDFFont = font) => {
    const palabras = limpia(t).split(" "); let linea = "";
    for (const p of palabras) {
      if (f.widthOfTextAtSize(`${linea} ${p}`, size) > W - 2 * M) { salto(size + 3); texto(linea, M, size, f); y -= size + 3; linea = p; }
      else linea = linea ? `${linea} ${p}` : p;
    }
    salto(size + 3); texto(linea, M, size, f); y -= size + 3;
  };

  texto(d.titulo, M, 16, bold); y -= 22;
  texto(`Generado el ${new Date().toLocaleDateString("es-ES")}`, M, 8); y -= 16;
  for (const [a, b] of d.resumen) {
    salto(13); texto(String(a), M, 9, bold); texto(String(b), M + 230, 9); y -= 13;
  }
  if (d.notas.length) {
    y -= 6; parrafo("Notas", 10, bold);
    d.notas.forEach((n) => parrafo(`• ${n}`, 8.5));
  }

  for (const t of d.tablas) {
    if (!t.filas.length) continue;
    const cols = t.columnas.map((_, i) => i).filter((i) => !t.soloExcel?.includes(i));
    // Ancho de cada columna proporcional a lo que contiene (cabecera y primeras filas)
    const peso = cols.map((i) => Math.min(26, Math.max(6, t.columnas[i].length, ...t.filas.slice(0, 40).map((f) => String(f[i] ?? "").length))));
    const total = peso.reduce((a, b) => a + b, 0);
    const util = W - 2 * M;
    const ancho = peso.map((p) => (p / total) * util);
    const x0 = ancho.reduce<number[]>((acc, a, k) => [...acc, (acc[k] ?? M) + a], [M]);
    const recorta = (s: string, k: number) => { const max = Math.max(3, Math.floor(ancho[k] / 4.4)); return s.length > max ? s.slice(0, max - 1) + "…" : s; };
    const cabecera = () => {
      cols.forEach((c, k) => texto(recorta(t.columnas[c], k), x0[k], 8, bold));
      y -= 12;
      page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    };

    y -= 14; salto(60); texto(t.titulo, M, 11, bold); y -= 15;
    cabecera();
    for (const fila of t.filas.slice(0, maxFilas)) {
      if (y - 12 < M) { nueva(); cabecera(); }
      cols.forEach((c, k) => {
        const v = fila[c];
        texto(typeof v === "number" ? num(v) : recorta(String(v ?? "—"), k), x0[k], 8);
      });
      y -= 12;
    }
    if (t.filas.length > maxFilas) { salto(12); texto(`… ${t.filas.length - maxFilas} filas más (descarga el Excel completo)`, M, 8); y -= 12; }
  }
  return pdf.save();
}

// ---------- Informe de producción y costes (pantalla Informes) ----------
function resumenFilas(inf: Informe, ctx: { finca: string; parcela: string; campana: string }) {
  const k = inf.kpis;
  return [
    ["Periodo", `${inf.filtros.desde} a ${inf.filtros.hasta}`], ["Finca", ctx.finca], ["Parcela", ctx.parcela], ["Campaña", ctx.campana],
    ["Cultivo", inf.filtros.cultivo ?? "Todos"],
    ["Producción (kg)", num(k.kgTotal)], ["Horas de mano de obra", num(k.horas)],
    ["Coste laboral (€)", k.costeLaboral == null ? `Parcial: ${num(k.costeLaboralParcial)} (hay partes sin tarifa)` : num(k.costeLaboral)],
    [`Gasto registrado (${k.moneda})`, k.gastoTotal == null ? "—" : num(k.gastoTotal)],
    ["Coste por hectárea", k.costeHa == null ? "No calculable" : num(k.costeHa)],
    ["Coste por kg", k.costeKg == null ? "No calculable" : num(k.costeKg, 3)],
    ["Kg por trabajador-hora", k.kgHora == null ? "No calculable" : num(k.kgHora)],
    ["Presupuestos/estimaciones (no contabilizados)", `${k.noContabilizado.n} registros · ${num(k.noContabilizado.importe)}`],
  ] as (string | number)[][];
}
const docInforme = (inf: Informe, ctx: { finca: string; parcela: string; campana: string }): Doc => ({
  titulo: "Informe de producción y costes", resumen: resumenFilas(inf, ctx), notas: inf.notas, tablas: inf.tablas,
});
export const generarExcel = (inf: Informe, ctx: { finca: string; parcela: string; campana: string }) => excelDeDoc(docInforme(inf, ctx));
export const generarPdf = (inf: Informe, ctx: { finca: string; parcela: string; campana: string }) => pdfDeDoc(docInforme(inf, ctx));
