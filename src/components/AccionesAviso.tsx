"use client";
import { useState, useTransition } from "react";
import { cambiarEstadoAviso } from "@/lib/actions";

export default function AccionesAviso({ id, estado }: { id: string; estado: string }) {
  const [pend, start] = useTransition();
  const [error, setError] = useState("");
  const [dias, setDias] = useState("1");

  function enviar(nuevo: string) {
    const fd = new FormData();
    fd.set("id", id); fd.set("estado", nuevo); fd.set("dias", dias);
    start(async () => { const r = await cambiarEstadoAviso(fd); setError(r?.error ?? ""); });
  }
  const b = "btn-ghost !px-2 !py-1 !text-xs";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {estado === "pendiente" && <button className={b} disabled={pend} onClick={() => enviar("leido")}>Marcar leído</button>}
      {estado !== "resuelto" && <button className={b} disabled={pend} onClick={() => enviar("resuelto")}>✔ Resuelto</button>}
      {estado !== "resuelto" && (
        <span className="flex items-center gap-1">
          <select className="input !w-auto !py-1 !text-xs" value={dias} onChange={(e) => setDias(e.target.value)}>
            <option value="1">1 día</option><option value="3">3 días</option><option value="7">1 semana</option><option value="30">1 mes</option>
          </select>
          <button className={b} disabled={pend} onClick={() => enviar("pospuesto")}>⏰ Posponer</button>
        </span>
      )}
      {(estado === "resuelto" || estado === "leido" || estado === "pospuesto") && <button className={b} disabled={pend} onClick={() => enviar("pendiente")}>Reabrir</button>}
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
