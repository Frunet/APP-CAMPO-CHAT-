import { useEffect, useRef, useState } from "react";
import type { Parte } from "../pages/Ultimos7";
import { CAMPOS_HORAS, MAX_HORAS_DIA } from "../lib/horas";
import { fecha, num } from "../lib/format";
import { db } from "../supabase";
import { msgError } from "../ui";
import Caja from "./CajaHoras";

const dec = (s: string) => s.trim() ? Number(s.replace(",", ".")) : 0;
const campoDe = (p: Parte) => CAMPOS_HORAS.findIndex(c => c.tarea === p.tipo_trabajo && (!c.subtipo || (p.actividad ?? "").startsWith(c.subtipo)));
type Entrada = { id: string | null; campo: number; horas: string; obs: string; original?: Parte };

/** Corrige la jornada de una persona y finca conservando los identificadores y los datos propios de cada parte. */
export default function EditarHoras({ lineas, nombre, finca, cerrar, alGuardar, actualizar, eliminar }: {
  lineas: Parte[]; nombre: string; finca: string; cerrar: () => void; alGuardar: () => void; actualizar: () => void; eliminar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [entradas, setEntradas] = useState<Entrada[]>(() => [
    ...lineas.map(p => {
      const campo = campoDe(p), subtipo = CAMPOS_HORAS[campo]?.subtipo;
      return { id: p.id, campo, horas: String(p.horas_por_trabajador), obs: subtipo ? (p.actividad ?? "").slice(subtipo.length).replace(/^\s*·\s*/, "") : p.actividad ?? "", original: p };
    }),
    ...CAMPOS_HORAS.flatMap((_, campo) => lineas.some(p => campoDe(p) === campo) ? [] : [{ id: null, campo, horas: "", obs: "" }]),
  ]);
  const [extra, setExtra] = useState(String(lineas.reduce((s, p) => s + Number(p.horas_extra_manuales || 0), 0) || ""));
  const [ocupado, setOcupado] = useState(false), [error, setError] = useState(""), [forzar, setForzar] = useState(false);
  useEffect(() => {
    dialogo.current?.showModal();
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previo; };
  }, []);
  const total = entradas.reduce((s, e) => s + (Number.isFinite(dec(e.horas)) ? dec(e.horas) : 0), 0);
  function cambiar(entrada: Entrada, cambios: Partial<Entrada>) { setEntradas(actual => actual.map(e => e === entrada ? { ...e, ...cambios } : e)); }
  function campo(entrada: Entrada, etiqueta: string) {
    return <input key={entrada.id ?? entrada.campo} aria-label={etiqueta} inputMode="decimal" className={`input input-sm mb-1 ${dec(entrada.horas) ? "fr-lleno" : ""}`} placeholder="0" value={entrada.horas} onChange={ev => cambiar(entrada, { horas: ev.target.value })} />;
  }
  async function guardar(ev: React.FormEvent) {
    ev.preventDefault(); setError("");
    if (entradas.some(e => !Number.isFinite(dec(e.horas)) || dec(e.horas) < 0 || dec(e.horas) > 24)) return setError("Las horas de cada tarea deben estar entre 0 y 24.");
    if (total <= 0 || total > 24) return setError("El total debe ser mayor que cero y no superar 24 horas por persona. Para borrar la jornada utiliza Eliminar.");
    const extras = dec(extra);
    if (!Number.isFinite(extras) || extras < 0 || extras > total) return setError("Las extras manuales deben estar entre cero y las horas totales.");
    if (total > MAX_HORAS_DIA && !forzar) return setError(`La jornada supera ${MAX_HORAS_DIA} h. Revisa las horas o marca «Guardar igualmente».`);
    let resto = extras;
    const filas = entradas.filter(e => e.id || dec(e.horas) > 0).map(e => {
      const c = CAMPOS_HORAS[e.campo];
      return { id: e.id, horas: dec(e.horas), extra: 0, mayor: e.original ? e.original.mayor : c.mayor, tarea: e.original ? e.original.tipo_trabajo : c.tarea,
        actividad: e.original && e.obs === (c?.subtipo ? (e.original.actividad ?? "").slice(c.subtipo.length).replace(/^\s*·\s*/, "") : e.original.actividad ?? "") ? e.original.actividad : [c?.subtipo, e.obs.trim()].filter(Boolean).join(" · ") || null };
    });
    // Si no cambian las extras ni se reduce una línea por debajo de ellas, se conserva su reparto original.
    const conservar = extras === lineas.reduce((s, p) => s + Number(p.horas_extra_manuales || 0), 0) && filas.every(f => f.horas >= Number(lineas.find(p => p.id === f.id)?.horas_extra_manuales || 0));
    for (const f of [...filas].reverse()) {
      f.extra = conservar ? Number(lineas.find(p => p.id === f.id)?.horas_extra_manuales || 0) : Math.min(resto, f.horas);
      resto = Math.round((resto - f.extra) * 100) / 100;
    }
    setOcupado(true);
    try {
      const { error } = await db.rpc("editar_jornada_horas", { p_originales: lineas.map(p => ({ id: p.id, updated_at: p.updated_at })), p_lineas: filas, p_forzar: forzar });
      if (error) throw new Error(msgError(error));
      alGuardar();
    } catch (e) { setError((e as Error).message); actualizar(); }
    finally { setOcupado(false); }
  }
  return <dialog ref={dialogo} aria-labelledby="editar-horas-titulo" onCancel={ev => { ev.preventDefault(); if (!ocupado) cerrar(); }} className="fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%-1rem)] max-w-4xl overflow-y-auto rounded-2xl bg-white p-3 text-stone-900 shadow-xl backdrop:bg-black/50 sm:p-5">
    <form onSubmit={guardar} className="space-y-4">
      <div className="flex items-start justify-between gap-3"><div><h2 id="editar-horas-titulo" className="text-lg font-extrabold">Editar horas</h2><p className="font-bold">{nombre}</p><p className="text-sm">{finca} · {fecha(lineas[0].fecha)}</p></div><button type="button" className="btn-ghost" disabled={ocupado} onClick={cerrar}>Cerrar</button></div>
      <p className="text-sm text-stone-600">Corrige las horas de las tareas. Pon 0 para quitar una tarea de esta jornada.</p>
      <fieldset disabled={ocupado} className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CAMPOS_HORAS.map((c, i) => <Caja key={c.etiqueta} mayor={c.mayor} tarea={c.etiqueta}>{entradas.filter(e => e.campo === i).map((e, n, todas) => campo(e, c.etiqueta + (todas.length > 1 ? ` · línea ${n + 1}` : "")))}</Caja>)}
        </div>
        {entradas.filter(e => e.campo < 0).map(e => <Caja key={e.id} tarea={e.original?.tipo_trabajo ?? "Tarea anterior"}>{campo(e, e.original?.tipo_trabajo ?? "Tarea anterior")}</Caja>)}
        <Caja tarea="De ellas, extras manuales (h)"><input inputMode="decimal" className="input input-sm sm:max-w-48" placeholder="0" value={extra} onChange={ev => setExtra(ev.target.value)} /><p className="mt-1 text-xs text-stone-600">Incluidas en el total por persona. Se mantiene el mínimo automático al superar 7 h/día.</p></Caja>
        <details><summary className="cursor-pointer text-sm font-bold">Observaciones por tarea</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">{entradas.filter(e => e.id || dec(e.horas) > 0).map((e, n) => <Caja key={e.id ?? e.campo} tarea={`${CAMPOS_HORAS[e.campo]?.etiqueta ?? e.original?.tipo_trabajo ?? "Tarea anterior"}${entradas.filter(x => x.campo === e.campo).length > 1 ? ` · línea ${n + 1}` : ""}`}><input aria-label={`Observaciones línea ${n + 1}`} className="input input-sm" maxLength={350} value={e.obs} onChange={ev => cambiar(e, { obs: ev.target.value })} /></Caja>)}</div></details>
        <p className="text-xs text-stone-600">Esta edición modifica las horas del trabajador. Los kilos de cosecha y el tractor se consultan y corrigen en sus registros propios.</p>
        {(total > MAX_HORAS_DIA || error.includes("12")) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={forzar} onChange={ev => setForzar(ev.target.checked)} />Guardar igualmente (más de {MAX_HORAS_DIA} h)</label>}
      </fieldset>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t-2 border-brand-600 bg-white py-3"><button className="btn" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar cambios"}</button><button type="button" className="btn-ghost" disabled={ocupado} onClick={cerrar}>Cancelar</button><b className="text-sm">{num(total, 2)} h por persona</b></div>
      <button type="button" className="text-sm text-red-600 underline" disabled={ocupado} onClick={eliminar}>Eliminar todas las horas de este trabajador en esta finca y fecha</button>
    </form>
  </dialog>;
}
