import { useEffect, useRef, useState } from "react";
import { db } from "../supabase";
import { fecha, num } from "../lib/format";
import { msgError } from "../ui";
import Caja from "./CajaHoras";

type Cosecha = { id: string; cultivo: string; variedad: string | null; kg: string };
const dec = (s: string) => Number(s.trim().replace(",", "."));

export default function EditarCosechas({ fechaDia, fincaId, finca, cerrar, alGuardar }: {
  fechaDia: string; fincaId: string; finca: string; cerrar: () => void; alGuardar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [cosechas, setCosechas] = useState<Cosecha[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialogo.current?.showModal();
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let vivo = true;
    (async () => {
      const r = await db.from("cosechas").select("id,cultivo,variedad,kg").eq("fecha", fechaDia).eq("finca_id", fincaId).order("id");
      if (!vivo) return;
      if (r.error) setError(msgError(r.error));
      setCosechas((r.data ?? []).map((c) => ({ id: c.id, cultivo: c.cultivo, variedad: c.variedad, kg: String(c.kg) })));
      setCargando(false);
    })();
    return () => { vivo = false; document.body.style.overflow = previo; };
  }, [fechaDia, fincaId]);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault(); setError("");
    if (!cosechas.length) return;
    if (cosechas.some((c) => !Number.isFinite(dec(c.kg)) || dec(c.kg) <= 0 || dec(c.kg) > 10_000_000)) return setError("Los kilos deben ser mayores que cero.");
    setOcupado(true);
    try {
      for (const c of cosechas) {
        const r = await db.from("cosechas").update({ kg: dec(c.kg) }).eq("id", c.id).eq("fecha", fechaDia).eq("finca_id", fincaId).select("id");
        if (r.error) throw new Error(msgError(r.error));
        if (!r.data?.length) throw new Error("No se pudo actualizar una cosecha; vuelve a cargar el día.");
      }
      alGuardar();
    } catch (e) { setError((e as Error).message); }
    finally { setOcupado(false); }
  }

  return <dialog ref={dialogo} aria-labelledby="editar-cosechas-titulo" onCancel={(ev) => { ev.preventDefault(); if (!ocupado) cerrar(); }} className="fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%-1rem)] max-w-xl overflow-y-auto rounded-2xl bg-white p-3 text-stone-900 shadow-xl backdrop:bg-black/50 sm:p-5">
    <form onSubmit={guardar} className="space-y-4">
      <div className="flex items-start justify-between gap-3"><div><h2 id="editar-cosechas-titulo" className="text-lg font-extrabold">Editar kilos cosechados</h2><p className="font-bold">{finca}</p><p className="text-sm">{fecha(fechaDia)}</p></div><button type="button" className="btn-ghost" disabled={ocupado} onClick={cerrar}>Cerrar</button></div>
      <p className="text-sm text-stone-600">Corrige los kilos del día sin modificar las horas de ningún trabajador.</p>
      <fieldset disabled={ocupado} className="space-y-3">
        {cargando && <p className="text-sm text-stone-500">Cargando cosechas…</p>}
        {!cargando && !cosechas.length && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No hay kilos registrados para esta finca y fecha.</p>}
        {cosechas.map((c, i) => <Caja key={c.id} tarea={`${c.cultivo}${c.variedad ? ` · ${c.variedad}` : ""}${cosechas.length > 1 ? ` · línea ${i + 1}` : ""}`}><input aria-label={`Kilos de ${c.cultivo}`} inputMode="decimal" className="input input-sm" value={c.kg} onChange={(ev) => setCosechas(actual => actual.map(x => x.id === c.id ? { ...x, kg: ev.target.value } : x))} /><p className="mt-1 text-xs text-stone-500">Actual: {num(Number(c.kg), 2)} kg</p></Caja>)}
      </fieldset>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t-2 border-brand-600 bg-white py-3"><button className="btn" disabled={ocupado || cargando || !cosechas.length}>{ocupado ? "Guardando…" : "Guardar kilos"}</button><button type="button" className="btn-ghost" disabled={ocupado} onClick={cerrar}>Cancelar</button></div>
    </form>
  </dialog>;
}
