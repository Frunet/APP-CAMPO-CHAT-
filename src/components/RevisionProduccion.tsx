"use client";
import { useMemo, useState } from "react";
import ActionForm from "./ActionForm";
import type { FincaOpt } from "./FincaParcela";
import { importarProduccion } from "@/lib/actions";

type Reg = { finca_ref: string; cultivo: string; anio: number; kg: number | null; importe: number | null; dudas: string[] };

const nm = (x: unknown) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const f0 = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 0 });

/** Tarjeta de una tabla de producción por años: muestra la tabla leída y pide a qué finca de la aplicación corresponde cada finca de la hoja. */
export default function RevisionProduccion({
  documentoId, fincas, registros, importados, puedeImportar, alTerminar,
}: { documentoId: string; fincas: FincaOpt[]; registros: Reg[]; importados: number[]; puedeImportar: boolean; alTerminar: () => void }) {
  const pend = useMemo(() => registros.filter((_, i) => !importados.includes(i)), [registros, importados]);
  const refs = useMemo(() => [...new Set(pend.map((r) => r.finca_ref))], [pend]);
  const anios = useMemo(() => [...new Set(pend.map((r) => r.anio))].sort(), [pend]);
  const filas = useMemo(() => {
    const m = new Map<string, Map<number, Reg>>();
    for (const r of pend) {
      const k = `${r.finca_ref}|${r.cultivo}`;
      if (!m.has(k)) m.set(k, new Map());
      m.get(k)!.set(r.anio, r);
    }
    return [...m.entries()];
  }, [pend]);
  const sugerida = (ref: string) => {
    const n = nm(ref);
    const ex = fincas.filter((f) => nm(f.nombre) === n);
    return ex.length === 1 ? ex[0].id : "";
  };
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const fincaDe = (ref: string) => mapa[ref] ?? sugerida(ref);

  if (!pend.length) return <p className="text-xs font-semibold text-green-700">✔ Todos los datos de producción están guardados.</p>;
  const listos = pend.filter((r) => fincaDe(r.finca_ref)).length;
  const payload = JSON.stringify(Object.fromEntries(refs.map((r) => [r, fincaDe(r) || null])));

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-stone-200 p-2">
        <p className="mb-1 text-xs font-medium text-stone-600">¿A qué finca corresponde cada una?</p>
        {refs.map((ref) => (
          <label key={ref} className="mb-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="min-w-32 font-medium">«{ref}»</span>
            <select className={`input !w-auto !py-1 ${fincaDe(ref) ? "" : "!border-red-400"}`} value={fincaDe(ref)} disabled={!puedeImportar}
              onChange={(e) => setMapa((m) => ({ ...m, [ref]: e.target.value }))}>
              <option value="">— elegir finca —</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </label>
        ))}
        {refs.some((r) => !fincaDe(r)) && <p className="mt-1 text-xs text-stone-500">Si la finca no existe, díselo al chat («da de alta la finca …») y pulsa ↻ arriba.</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr><th className="th">Finca</th><th className="th">Cultivo</th>{anios.map((a) => <th key={a} className="th text-right">{a} kg</th>)}{anios.map((a) => <th key={`e${a}`} className="th text-right">{a} €</th>)}</tr></thead>
          <tbody>{filas.map(([k, porAnio]) => {
            const [ref, cultivo] = k.split("|");
            return (
              <tr key={k}><td className="td">{ref}</td><td className="td">{cultivo}</td>
                {anios.map((a) => <td key={a} className="td text-right">{porAnio.get(a)?.kg != null ? f0(porAnio.get(a)!.kg!) : "—"}</td>)}
                {anios.map((a) => <td key={`e${a}`} className="td text-right">{porAnio.get(a)?.importe != null ? f0(porAnio.get(a)!.importe!) : "—"}</td>)}
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {puedeImportar ? (
        <ActionForm action={importarProduccion} label={`Guardar ${listos} dato(s) de producción`} reset={false} className="flex flex-wrap items-center gap-3"
          confirmar={`Se guardarán ${listos} datos de producción (finca, cultivo y año). Si ya existían, se actualizan. ¿Guardar?`} alTerminar={alTerminar}>
          <input type="hidden" name="documento_id" value={documentoId} />
          <input type="hidden" name="mapa" value={payload} />
        </ActionForm>
      ) : <p className="text-xs text-stone-500">Tu rol no permite guardar estos datos.</p>}
    </div>
  );
}
