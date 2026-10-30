"use client";
import { useMemo, useState } from "react";
import ActionForm, { Field } from "./ActionForm";
import { registrarHoras } from "@/lib/actions";
import { MAX_HORAS_DIA, TAREAS_AYUDA, TAREAS_HORAS } from "@/lib/horas";

type Trab = { id: string; codigo: string | null; nombre: string; finca_id: string | null };
type Finca = { id: string; nombre: string };

const num = (v: string) => { const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : 0; };

/** Registro de horas: se marcan los trabajadores (buscando por código o nombre), se elige finca y fecha y se ponen las horas de cada tarea. */
export default function FormHoras({ fincas, trabajadores, hoy }: { fincas: Finca[]; trabajadores: Trab[]; hoy: string }) {
  const [finca, setFinca] = useState(fincas.length === 1 ? fincas[0].id : "");
  const [fecha, setFecha] = useState(hoy);
  const [actividad, setActividad] = useState("");
  const [forzar, setForzar] = useState(false);
  const [tick, setTick] = useState(0); // React reinicia el formulario tras cada envío: se vuelve a pintar para que lo marcado siga marcado
  const [buscar, setBuscar] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [horas, setHoras] = useState<string[]>(TAREAS_HORAS.map(() => ""));
  const total = horas.reduce((a, h) => a + num(h), 0);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return trabajadores.filter((t) => (!finca || !t.finca_id || t.finca_id === finca) && (!q || `${t.codigo ?? ""} ${t.nombre}`.toLowerCase().includes(q)));
  }, [trabajadores, finca, buscar]);
  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <ActionForm action={async (fd) => { const r = await registrarHoras(fd); setTick((t) => t + 1); return r; }} label="Añadir" reset={false} className="space-y-4" alTerminar={() => { setSel([]); setHoras(TAREAS_HORAS.map(() => "")); setActividad(""); setForzar(false); }}>
      <section className="rounded-lg border border-stone-200 p-3">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide">Seleccione a los empleados <span className="font-normal normal-case text-stone-500">({sel.length} marcados)</span></p>
        <input className="input mb-2" placeholder="Buscar por código o nombre…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <div className="max-h-56 overflow-y-auto rounded-lg border border-stone-200">
          {visibles.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-3 border-b border-stone-100 px-3 py-2 text-sm last:border-0">
              <input key={tick} type="checkbox" value={t.id} checked={sel.includes(t.id)} onChange={() => alternar(t.id)} className="h-5 w-5" />
              {t.codigo && <span className="font-mono text-xs text-stone-500">{t.codigo}</span>}<span>{t.nombre}</span>
            </label>
          ))}
          {!visibles.length && <p className="p-3 text-sm text-stone-500">No hay trabajadores{buscar ? " con ese texto" : ""}.</p>}
        </div>
        {sel.map((id) => <input key={id} type="hidden" name="trabajador" value={id} />)}
      </section>

      <section className="grid gap-3 rounded-lg border border-stone-200 p-3 sm:grid-cols-3">
        <Field label="Finca *">
          <select name="finca_id" className="input" required value={finca} onChange={(e) => setFinca(e.target.value)}>
            <option value="">Elige…</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </Field>
        <Field label="Fecha *"><input type="date" name="fecha" className="input" required value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} /></Field>
        <div className="hidden sm:block" />
        {TAREAS_HORAS.map((t, i) => (
          <Field key={t} label={`${t}${TAREAS_AYUDA[t] ? ` (${TAREAS_AYUDA[t]})` : ""}`}>
            <input name={`h${i}`} inputMode="decimal" className="input" placeholder="0" value={horas[i]} onChange={(e) => setHoras((h) => h.map((x, j) => (j === i ? e.target.value : x)))} />
          </Field>
        ))}
        <Field label="Tareas" wide><input name="actividad" className="input" placeholder="Escriba aquí…" maxLength={500} value={actividad} onChange={(e) => setActividad(e.target.value)} /></Field>
        <p className={`col-span-full text-sm ${total > MAX_HORAS_DIA ? "font-semibold text-amber-700" : "text-stone-600"}`}>
          Horas por trabajador: <b>{total.toLocaleString("es-ES", { maximumFractionDigits: 2 })}</b>
          {total > MAX_HORAS_DIA && <> · ⚠ pasa de {MAX_HORAS_DIA} h en un día</>}
          {sel.length > 0 && total > 0 && <> · total {(total * sel.length).toLocaleString("es-ES", { maximumFractionDigits: 2 })} h</>}
        </p>
        <label className="col-span-full flex items-center gap-2 text-xs text-stone-600"><input type="checkbox" name="forzar" checked={forzar} onChange={(e) => setForzar(e.target.checked)} /> Registrar igualmente aunque alguien pase de {MAX_HORAS_DIA} h ese día</label>
      </section>
    </ActionForm>
  );
}
