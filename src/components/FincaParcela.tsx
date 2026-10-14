"use client";
import { useState } from "react";
import { Field } from "./ActionForm";

export type FincaOpt = { id: string; nombre: string; parcelas: { id: string; codigo: string; nombre: string | null }[] };

/** Selector de finca con parcelas dependientes. */
export default function FincaParcela({
  fincas, finca, parcela, parcelaObligatoria = false,
}: { fincas: FincaOpt[]; finca?: string; parcela?: string | null; parcelaObligatoria?: boolean }) {
  const [f, setF] = useState(finca ?? "");
  const parcelas = fincas.find((x) => x.id === f)?.parcelas ?? [];
  return (
    <>
      <Field label="Finca *">
        <select name="finca_id" className="input" required value={f} onChange={(e) => setF(e.target.value)}>
          <option value="">Elige…</option>
          {fincas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>
      </Field>
      <Field label={`Parcela${parcelaObligatoria ? " *" : ""}`}>
        <select name="parcela_id" className="input" required={parcelaObligatoria} defaultValue={parcela ?? ""} key={f}>
          <option value="">{parcelaObligatoria ? "Elige…" : "— toda la finca —"}</option>
          {parcelas.map((p) => <option key={p.id} value={p.id}>{p.codigo}{p.nombre ? ` · ${p.nombre}` : ""}</option>)}
        </select>
      </Field>
    </>
  );
}
