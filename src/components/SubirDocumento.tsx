"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FincaOpt } from "./FincaParcela";

const ACCEPT = ".pdf,.xls,.xlsx,.csv,.docx,.jpg,.jpeg,.png";

export default function SubirDocumento({ fincas }: { fincas: FincaOpt[] }) {
  const router = useRouter();
  const [finca, setFinca] = useState("");
  const [estado, setEstado] = useState<"" | "subiendo" | "leyendo">("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg({}); setEstado("subiendo");
    try {
      const r = await fetch("/api/documentos", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) {
        setMsg({ error: j.error });
        if (j.duplicadoId) router.push(`/documentos/${j.duplicadoId}`);
        return;
      }
      setEstado("leyendo");
      const p = await fetch(`/api/documentos/${j.id}/procesar`, { method: "POST" });
      const pj = await p.json();
      // Aunque la lectura falle, el original ya está guardado: se puede reintentar desde la ficha
      if (!p.ok) setMsg({ error: `Archivo guardado, pero: ${pj.error} Puedes reintentar desde su ficha.` });
      router.push(`/documentos/${j.id}`);
    } catch {
      setMsg({ error: "Error de conexión." });
    } finally { setEstado(""); }
  }

  const parcelas = fincas.find((f) => f.id === finca)?.parcelas ?? [];
  return (
    <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-3">
      <label className="col-span-full block text-sm">
        <span className="mb-1 block text-xs font-medium text-stone-600">Archivo (PDF, Excel, CSV, Word .docx, JPG, PNG · máx. 15 MB) *</span>
        <input type="file" name="archivo" accept={ACCEPT} required className="input" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-stone-600">Finca (opcional, se puede fijar luego)</span>
        <select name="finca_id" className="input" value={finca} onChange={(e) => setFinca(e.target.value)}>
          <option value="">—</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-stone-600">Parcela</span>
        <select name="parcela_id" className="input" key={finca}><option value="">—</option>{parcelas.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}</select>
      </label>
      <div className="flex items-end">
        <button className="btn w-full" disabled={!!estado}>{estado === "subiendo" ? "Subiendo…" : estado === "leyendo" ? "Leyendo documento…" : "Subir y leer"}</button>
      </div>
      {msg.error && <p role="alert" className="col-span-full text-sm text-red-600">{msg.error}</p>}
    </form>
  );
}
