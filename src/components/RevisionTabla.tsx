"use client";
import { useMemo, useState } from "react";
import ActionForm from "./ActionForm";
import type { FincaOpt } from "./FincaParcela";
import { importarRegistros } from "@/lib/actions";

type Tipo = "gasto" | "cosecha" | "parte";
type Fila = Record<string, string> & { tipo: Tipo; dudas: string };
const CATS = ["mano_obra", "insumos", "maquinaria", "combustible", "semillas_plantas", "riego_agua", "herramientas", "transporte", "otros"];

const txt = (v: unknown) => (v == null ? "" : String(v));
const nul = (v: string) => (v.trim() === "" ? null : v.trim());
const numero = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));

export default function RevisionTabla({
  documentoId, fincas, fincaInicial, registros, importados, puedeImportar,
}: {
  documentoId: string; fincas: FincaOpt[]; fincaInicial: string;
  registros: Record<string, any>[]; importados: number[]; puedeImportar: boolean;
}) {
  const [finca, setFinca] = useState(fincaInicial);
  const parcelas = useMemo(() => fincas.find((f) => f.id === finca)?.parcelas ?? [], [fincas, finca]);

  const [filas, setFilas] = useState<Fila[]>(() =>
    registros.map((r) => ({
      tipo: r.tipo, fecha: txt(r.fecha), parcela: txt(r.parcela), categoria: txt(r.categoria) || "otros",
      proveedor: txt(r.proveedor), concepto: txt(r.concepto), importe: txt(r.importe), moneda: txt(r.moneda) || "EUR",
      tipo_importe: "registrado", cultivo: txt(r.cultivo), variedad: txt(r.variedad), kg: txt(r.kg), cajas: txt(r.cajas),
      calidad: txt(r.calidad), num_trabajadores: txt(r.num_trabajadores), horas_por_trabajador: txt(r.horas_por_trabajador),
      actividad: txt(r.actividad), dudas: (r.dudas ?? []).join(" · "),
    })),
  );
  // Las filas con dudas NO vienen marcadas: hay que revisarlas y marcarlas a propósito
  const [sel, setSel] = useState<Set<number>>(() => new Set(registros.map((r, i) => (!(r.dudas ?? []).length && !importados.includes(i) ? i : -1)).filter((i) => i >= 0)));

  const set = (i: number, k: string, v: string) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const parcelaId = (f: Fila) => {
    const t = f.parcela.trim().toLowerCase().replace(/^parcela\s*/, "");
    return parcelas.find((p) => p.id === f.parcela || p.codigo.toLowerCase() === t || (p.nombre ?? "").toLowerCase() === t)?.id ?? null;
  };

  const payload = JSON.stringify(
    [...sel].sort((a, b) => a - b).map((idx) => {
      const f = filas[idx];
      const base = { fecha: f.fecha, parcela_id: parcelaId(f) };
      const datos =
        f.tipo === "gasto" ? { ...base, categoria: f.categoria, importe: numero(f.importe), moneda: f.moneda.toUpperCase(), tipo_importe: f.tipo_importe, proveedor: nul(f.proveedor), concepto: nul(f.concepto) }
        : f.tipo === "cosecha" ? { ...base, cultivo: f.cultivo, variedad: nul(f.variedad), kg: numero(f.kg), cajas: nul(f.cajas) == null ? null : numero(f.cajas), calidad: nul(f.calidad) }
        : { ...base, num_trabajadores: numero(f.num_trabajadores), horas_por_trabajador: numero(f.horas_por_trabajador), actividad: nul(f.actividad) };
      return { idx, tipo: f.tipo, datos };
    }),
    (_, v) => (typeof v === "number" && Number.isNaN(v) ? null : v), // NaN → null: el servidor lo rechaza con mensaje claro
  );

  if (!registros.length) return <p className="text-sm text-stone-500">No se detectaron registros importables en este documento.</p>;

  const inp = "input !py-1";
  return (
    <div className="space-y-3">
      <label className="block max-w-sm text-sm">
        <span className="mb-1 block text-xs font-medium text-stone-600">Finca a la que pertenecen estos registros *</span>
        <select className="input" value={finca} onChange={(e) => setFinca(e.target.value)}>
          <option value="">Elige…</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </select>
      </label>

      {filas.map((f, i) => {
        const hecho = importados.includes(i);
        const sinParcela = f.parcela.trim() && finca && !parcelaId(f);
        return (
          <div key={i} className={`rounded-lg border p-3 ${hecho ? "border-green-300 bg-green-50 opacity-70" : f.dudas ? "border-amber-300 bg-amber-50" : "border-stone-200"}`}>
            <div className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={hecho || !puedeImportar} checked={sel.has(i)}
                onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(i) : n.delete(i); return n; })} />
              <b>#{i + 1}</b>
              <select className="input !w-auto !py-1" value={f.tipo} disabled={hecho} onChange={(e) => set(i, "tipo", e.target.value)}>
                <option value="gasto">Gasto</option><option value="cosecha">Cosecha</option><option value="parte">Parte de trabajo</option>
              </select>
              {hecho && <span className="text-xs font-semibold text-green-700">✔ Ya importado</span>}
            </div>
            {f.dudas && <p className="mb-2 text-xs text-amber-800">⚠ Revisar: {f.dudas}</p>}
            <fieldset disabled={hecho || !puedeImportar} className="grid gap-2 sm:grid-cols-4">
              <label className="text-xs">Fecha<input type="date" className={inp} value={f.fecha} onChange={(e) => set(i, "fecha", e.target.value)} /></label>
              <label className="text-xs">Parcela{f.tipo === "cosecha" ? " *" : ""}
                <select className={inp} value={parcelaId(f) ?? ""} onChange={(e) => set(i, "parcela", e.target.value)}>
                  <option value="">{sinParcela ? `«${f.parcela}» no existe` : "—"}</option>
                  {parcelas.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}
                </select>
              </label>
              {f.tipo === "gasto" && (<>
                <label className="text-xs">Categoría<select className={inp} value={f.categoria} onChange={(e) => set(i, "categoria", e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="text-xs">Importe<input className={inp} inputMode="decimal" value={f.importe} onChange={(e) => set(i, "importe", e.target.value)} /></label>
                <label className="text-xs">Moneda<input className={inp} maxLength={3} value={f.moneda} onChange={(e) => set(i, "moneda", e.target.value)} /></label>
                <label className="text-xs">Naturaleza<select className={inp} value={f.tipo_importe} onChange={(e) => set(i, "tipo_importe", e.target.value)}>{["registrado", "presupuesto", "estimacion", "prevision"].map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="text-xs">Proveedor<input className={inp} value={f.proveedor} onChange={(e) => set(i, "proveedor", e.target.value)} /></label>
                <label className="text-xs">Concepto<input className={inp} value={f.concepto} onChange={(e) => set(i, "concepto", e.target.value)} /></label>
              </>)}
              {f.tipo === "cosecha" && (<>
                <label className="text-xs">Cultivo<input className={inp} value={f.cultivo} onChange={(e) => set(i, "cultivo", e.target.value)} /></label>
                <label className="text-xs">Variedad<input className={inp} value={f.variedad} onChange={(e) => set(i, "variedad", e.target.value)} /></label>
                <label className="text-xs">Kg<input className={inp} inputMode="decimal" value={f.kg} onChange={(e) => set(i, "kg", e.target.value)} /></label>
                <label className="text-xs">Cajas<input className={inp} inputMode="numeric" value={f.cajas} onChange={(e) => set(i, "cajas", e.target.value)} /></label>
                <label className="text-xs">Calidad<input className={inp} value={f.calidad} onChange={(e) => set(i, "calidad", e.target.value)} /></label>
              </>)}
              {f.tipo === "parte" && (<>
                <label className="text-xs">Nº trabajadores<input className={inp} inputMode="numeric" value={f.num_trabajadores} onChange={(e) => set(i, "num_trabajadores", e.target.value)} /></label>
                <label className="text-xs">Horas por persona<input className={inp} inputMode="decimal" value={f.horas_por_trabajador} onChange={(e) => set(i, "horas_por_trabajador", e.target.value)} /></label>
                <label className="text-xs sm:col-span-2">Actividad<input className={inp} value={f.actividad} onChange={(e) => set(i, "actividad", e.target.value)} /></label>
              </>)}
            </fieldset>
          </div>
        );
      })}

      {puedeImportar ? (
        <ActionForm action={importarRegistros} label={`Importar ${sel.size} fila(s) marcada(s)`} reset={false} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="documento_id" value={documentoId} />
          <input type="hidden" name="finca_id" value={finca} />
          <input type="hidden" name="filas" value={payload} />
        </ActionForm>
      ) : <p className="text-xs text-stone-500">Tu rol no permite importar registros.</p>}
      <p className="text-xs text-stone-500">Solo se importan las filas marcadas. Las que tienen dudas están desmarcadas hasta que las revises.</p>
    </div>
  );
}
