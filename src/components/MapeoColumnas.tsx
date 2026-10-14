"use client";
import { useActionState } from "react";
import { aplicarMapeoDocumento, type Res } from "@/lib/actions";

const CAMPOS: [string, string, boolean][] = [
  ["fecha", "Fecha", true], ["tercero", "Proveedor / cliente", true], ["nif", "NIF/CIF", false], ["numero", "Nº de factura", true], ["base", "Base imponible", true],
  ["iva", "IVA (importe)", false], ["total", "Total", false], ["concepto", "Concepto", false], ["finca", "Finca / parcela / albarán", false], ["tipo", "Tipo (emitida/recibida)", false],
];

/** Pregunta qué columna es cada dato cuando no se han podido identificar todas (Excel/CSV de facturas). */
export default function MapeoColumnas({ documentoId, pendiente, alTerminar }: {
  documentoId: string; alTerminar: () => void;
  pendiente: { cabeceras: string[]; mapeo: Record<string, number>; faltan: string[]; muestra: string[][]; tipo_defecto: "gasto" | "venta" | null };
}) {
  const [estado, accion, enviando] = useActionState(async (_: Res, fd: FormData) => { const r = await aplicarMapeoDocumento(fd); if (r?.ok) alTerminar(); return r; }, null);
  return (
    <form action={accion} className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <input type="hidden" name="documento_id" value={documentoId} />
      <p className="font-medium">No he podido identificar todas las columnas. Indica cuál es cada dato:</p>
      {pendiente.faltan.length > 0 && <p className="text-xs text-amber-900">Sin identificar: {CAMPOS.filter(([k]) => pendiente.faltan.includes(k)).map(([, t]) => t).join(", ")}.</p>}
      <div className="grid gap-2 sm:grid-cols-3">
        {CAMPOS.map(([k, t, oblig]) => (
          <label key={k} className="text-xs">{t}{oblig ? " *" : ""}
            <select name={`col_${k}`} className="input !py-1" defaultValue={pendiente.mapeo[k] != null ? String(pendiente.mapeo[k]) : ""}>
              <option value="">{oblig ? "— elige —" : "— no hay —"}</option>
              {pendiente.cabeceras.map((c, i) => <option key={i} value={i}>{c || `(columna ${i + 1})`}</option>)}
            </select>
          </label>
        ))}
        <label className="text-xs">Si no hay columna «Tipo», son facturas…
          <select name="tipo_facturas" className="input !py-1" defaultValue={pendiente.tipo_defecto ?? ""}>
            <option value="">— elige —</option><option value="gasto">recibidas (gastos)</option><option value="venta">emitidas (ventas)</option>
          </select>
        </label>
      </div>
      {pendiente.muestra.length > 0 && (
        <div className="overflow-x-auto text-xs"><table className="w-full"><thead><tr>{pendiente.cabeceras.map((c, i) => <th key={i} className="th">{c}</th>)}</tr></thead>
          <tbody>{pendiente.muestra.map((f, r) => <tr key={r}>{f.map((c, i) => <td key={i} className="td">{c}</td>)}</tr>)}</tbody></table></div>
      )}
      <div className="flex items-center gap-3">
        <button className="btn" disabled={enviando}>{enviando ? "Leyendo…" : "Leer con estas columnas"}</button>
        {estado?.error && <span role="alert" className="text-sm text-red-600">{estado.error}</span>}
      </div>
    </form>
  );
}
