import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import * as XLSX from "xlsx";
import type { Informe } from "./informes";

const num = (n: number | null | undefined, d = 2) => (n == null ? "—" : n.toLocaleString("es-ES", { maximumFractionDigits: d }));

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

export function generarExcel(inf: Informe, ctx: { finca: string; parcela: string; campana: string }): Buffer {
  const wb = XLSX.utils.book_new();
  const res = [["Informe de producción y costes"], [], ...resumenFilas(inf, ctx), [], ["Notas"], ...inf.notas.map((n) => [n])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(res), "Resumen");
  for (const t of inf.tablas) {
    const ws = XLSX.utils.aoa_to_sheet([t.columnas, ...t.filas]);
    ws["!cols"] = t.columnas.map((c) => ({ wch: Math.max(14, c.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, t.titulo.replace(/[\\/?*[\]:]/g, "").slice(0, 31));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// WinAnsi (fuente estándar del PDF) cubre acentos, ñ y €; lo demás se sustituye
const limpia = (s: string) => s.replace(/[^\x20-\x7E -ÿ€]/g, "?");

export async function generarPdf(inf: Informe, ctx: { finca: string; parcela: string; campana: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 40;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const salto = (alto: number) => { if (y - alto < M) { page = pdf.addPage([W, H]); y = H - M; } };
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

  texto("Informe de producción y costes", M, 16, bold); y -= 22;
  texto(`Generado el ${new Date().toLocaleDateString("es-ES")}`, M, 8); y -= 16;
  for (const [a, b] of resumenFilas(inf, ctx)) {
    salto(13); texto(String(a), M, 9, bold); texto(String(b), M + 230, 9); y -= 13;
  }
  if (inf.notas.length) {
    y -= 6; parrafo("Notas", 10, bold);
    inf.notas.forEach((n) => parrafo(`• ${n}`, 8.5));
  }

  for (const t of inf.tablas) {
    if (!t.filas.length) continue;
    y -= 14; salto(40); texto(t.titulo, M, 11, bold); y -= 15;
    const ancho = (W - 2 * M) / t.columnas.length;
    t.columnas.forEach((c, i) => texto(c, M + i * ancho, 8.5, bold)); y -= 12;
    page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    for (const fila of t.filas.slice(0, 200)) {
      salto(12);
      fila.forEach((v, i) => texto(typeof v === "number" ? num(v) : String(v ?? "—").slice(0, 40), M + i * ancho, 8.5));
      y -= 12;
    }
    if (t.filas.length > 200) { salto(12); texto(`… ${t.filas.length - 200} filas más (descarga el Excel completo)`, M, 8); y -= 12; }
  }
  return pdf.save();
}
