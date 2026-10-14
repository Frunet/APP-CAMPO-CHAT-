"use client";
import { useState } from "react";
import { Field } from "../ActionForm";

export type ArbolFinca = {
  id: string; nombre: string;
  parcelas: { id: string; codigo: string; nombre: string | null; lotes: { id: string; codigo: string; nombre: string | null }[] }[];
};

/** Parcela y lote (opcional) para una finca ya fijada o para elegir entre varias. */
export function ParcelaLote({ fincas, conFinca = true, loteOpcional = true }: { fincas: ArbolFinca[]; conFinca?: boolean; loteOpcional?: boolean }) {
  const [f, setF] = useState(conFinca ? "" : fincas[0]?.id ?? "");
  const [p, setP] = useState("");
  const parcelas = fincas.find((x) => x.id === f)?.parcelas ?? [];
  const lotes = parcelas.find((x) => x.id === p)?.lotes ?? [];
  return (
    <>
      {conFinca && (
        <Field label="Finca *">
          <select className="input" required value={f} onChange={(e) => { setF(e.target.value); setP(""); }}>
            <option value="">Elige…</option>{fincas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </Field>
      )}
      <Field label="Parcela *">
        <select name="parcela_id" className="input" required value={p} onChange={(e) => setP(e.target.value)}>
          <option value="">Elige…</option>{parcelas.map((x) => <option key={x.id} value={x.id}>{x.codigo}{x.nombre ? ` · ${x.nombre}` : ""}</option>)}
        </select>
      </Field>
      {loteOpcional && (
        <Field label="Lote (opcional)">
          <select name="lote_id" className="input" defaultValue="" key={p} disabled={!lotes.length}>
            <option value="">{lotes.length ? "— toda la parcela —" : "La parcela no tiene lotes"}</option>
            {lotes.map((x) => <option key={x.id} value={x.id}>{x.codigo}{x.nombre ? ` · ${x.nombre}` : ""}</option>)}
          </select>
        </Field>
      )}
    </>
  );
}

/** Elige un cultivo/variedad del catálogo y rellena los dos campos que espera el servidor. */
export function CultivoSelect({ catalogo }: { catalogo: { id: string; cultivo: string; variedad: string | null }[] }) {
  const [sel, setSel] = useState("");
  const item = catalogo.find((c) => c.id === sel);
  return (
    <Field label="Cultivo y variedad (del catálogo) *">
      <select className="input" required value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">Elige…</option>
        {catalogo.map((c) => <option key={c.id} value={c.id}>{c.cultivo}{c.variedad ? ` · ${c.variedad}` : ""}</option>)}
      </select>
      <input type="hidden" name="cultivo" value={item?.cultivo ?? ""} />
      <input type="hidden" name="variedad" value={item?.variedad ?? ""} />
    </Field>
  );
}
