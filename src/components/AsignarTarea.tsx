"use client";
import { useState, useTransition } from "react";
import { asignarTarea, eliminarTarea } from "@/lib/actions";

type Opcion = { v: string; label: string };

/** Mueve una tarea: a una semana (sin día), a un día concreto o de vuelta a pendientes. */
export default function AsignarTarea({
  id, fecha, semana, opciones, sugerida,
}: {
  id: string; fecha: string | null; semana: string | null; opciones: Opcion[];
  /** Semana que se está viendo: añade un botón para traer la tarea a ella */
  sugerida?: string;
}) {
  const [pend, start] = useTransition();
  const [error, setError] = useState("");

  function enviar(campos: Record<string, string>) {
    const fd = new FormData();
    fd.set("id", id);
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    start(async () => { const r = await asignarTarea(fd); setError(r?.error ?? ""); });
  }
  function borrar() {
    if (!window.confirm("¿Eliminar esta tarea?")) return;
    const fd = new FormData(); fd.set("id", id);
    start(async () => { const r = await eliminarTarea(fd); setError(r?.error ?? ""); });
  }

  const b = "btn-ghost !px-2 !py-1 !text-xs";
  const campo = "input !w-auto !py-1 !text-xs";
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {sugerida && semana !== sugerida && !fecha && (
        <button className={b} disabled={pend} onClick={() => enviar({ modo: "semana", semana: sugerida })}>→ A esta semana</button>
      )}
      <label className="flex items-center gap-1 text-xs text-stone-500">
        Semana
        <select className={campo} disabled={pend} value={fecha ? "" : semana ?? ""}
          onChange={(e) => (e.target.value ? enviar({ modo: "semana", semana: e.target.value }) : enviar({ modo: "nada" }))}>
          <option value="">{fecha ? "— (tiene día) —" : "Sin asignar"}</option>
          {opciones.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs text-stone-500">
        Día
        <input type="date" className={campo} disabled={pend} value={fecha ?? ""}
          onChange={(e) => (e.target.value ? enviar({ modo: "dia", fecha: e.target.value }) : semana ? enviar({ modo: "semana", semana }) : enviar({ modo: "nada" }))} />
      </label>
      {(fecha || semana) && (
        <button className={b} disabled={pend} onClick={() => enviar({ modo: "nada" })} title="Quitar fecha y semana">A pendientes</button>
      )}
      <button className={`${b} !text-red-700`} disabled={pend} onClick={borrar} aria-label="Eliminar tarea">🗑</button>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
