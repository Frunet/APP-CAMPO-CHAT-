"use client";
import { useMemo, useState } from "react";
import ActionForm, { Field } from "./ActionForm";
import { registrarHoras } from "@/lib/actions";
import { MAX_HORAS_DIA, TAREAS } from "@/lib/horas";

type Trab = { id: string; codigo: string | null; nombre: string; finca_id: string | null };
type Finca = { id: string; nombre: string };
type Variedad = { id: string; cultivo: string; variedad: string | null };
type Linea = { tarea: string; subtipo: string; horas: string; kg: string; variedad: string };

const num = (v: string) => { const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const vacia = (): Linea => ({ tarea: "", subtipo: "", horas: "", kg: "", variedad: "" });

/**
 * Registro de horas: se marcan los trabajadores (buscando por código o nombre), se elige finca y fecha y se añaden líneas de tarea con sus horas.
 * Subtipo obligatorio en Hierba y Reparaciones; kg y variedad solo aparecen (y son obligatorios) en Cosecha.
 */
export default function FormHoras({ fincas, trabajadores, variedades, hoy }: { fincas: Finca[]; trabajadores: Trab[]; variedades: Variedad[]; hoy: string }) {
  const [finca, setFinca] = useState(fincas.length === 1 ? fincas[0].id : "");
  const [fecha, setFecha] = useState(hoy);
  const [actividad, setActividad] = useState("");
  const [forzar, setForzar] = useState(false);
  const [tick, setTick] = useState(0); // React reinicia el formulario tras cada envío: se vuelve a pintar para que lo marcado siga marcado
  const [buscar, setBuscar] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([vacia()]);
  const total = lineas.reduce((a, l) => a + num(l.horas), 0);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return trabajadores.filter((t) => (!finca || !t.finca_id || t.finca_id === finca) && (!q || `${t.codigo ?? ""} ${t.nombre}`.toLowerCase().includes(q)));
  }, [trabajadores, finca, buscar]);
  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const cambia = (i: number, c: Partial<Linea>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...c } : l)));

  return (
    <ActionForm
      action={async (fd) => { const r = await registrarHoras(fd); setTick((t) => t + 1); return r; }}
      label="Añadir" reset={false} className="space-y-4"
      alTerminar={() => { setSel([]); setLineas([vacia()]); setActividad(""); setForzar(false); }}>
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

      <section className="space-y-3 rounded-lg border border-stone-200 p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Finca *">
            <select name="finca_id" className="input" required value={finca} onChange={(e) => setFinca(e.target.value)}>
              <option value="">Elige…</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </Field>
          <Field label="Fecha *"><input type="date" name="fecha" className="input" required value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} /></Field>
        </div>

        {lineas.map((l, i) => {
          const def = TAREAS.find((t) => t.nombre === l.tarea);
          return (
            <div key={i} className="grid gap-3 rounded-lg bg-stone-50 p-2 sm:grid-cols-5">
              <Field label="Tarea *">
                <select name={`l${i}_tarea`} className="input" required value={l.tarea} onChange={(e) => cambia(i, { tarea: e.target.value, subtipo: "", kg: "", variedad: "" })}>
                  <option value="">Elige…</option>{TAREAS.map((t) => <option key={t.nombre} value={t.nombre}>{t.nombre}</option>)}
                </select>
              </Field>
              {def?.subtipos && (
                <Field label="Subtipo *">
                  <select name={`l${i}_subtipo`} className="input" required value={l.subtipo} onChange={(e) => cambia(i, { subtipo: e.target.value })}>
                    <option value="">Elige…</option>{def.subtipos.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Horas por trabajador *"><input name={`l${i}_horas`} inputMode="decimal" className="input" required placeholder="7,5" value={l.horas} onChange={(e) => cambia(i, { horas: e.target.value })} /></Field>
              {def?.cosecha && (
                <>
                  <Field label="Kg cosechados *"><input name={`l${i}_kg`} inputMode="decimal" className="input" required value={l.kg} onChange={(e) => cambia(i, { kg: e.target.value })} /></Field>
                  <Field label="Variedad *">
                    <select name={`l${i}_variedad`} className="input" required value={l.variedad} onChange={(e) => cambia(i, { variedad: e.target.value })}>
                      <option value="">Elige…</option>{variedades.map((v) => <option key={v.id} value={v.id}>{v.cultivo}{v.variedad ? ` · ${v.variedad}` : ""}</option>)}
                    </select>
                  </Field>
                </>
              )}
              {lineas.length > 1 && <button type="button" className="self-end text-xs text-red-700" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>Quitar tarea</button>}
            </div>
          );
        })}
        <button type="button" className="btn-ghost !px-3 !py-1 !text-xs" onClick={() => setLineas((ls) => [...ls, vacia()])}>＋ Otra tarea</button>

        <Field label="Observaciones" wide><input name="actividad" className="input" placeholder="Escriba aquí…" maxLength={500} value={actividad} onChange={(e) => setActividad(e.target.value)} /></Field>
        <p className={`text-sm ${total > MAX_HORAS_DIA ? "font-semibold text-amber-700" : "text-stone-600"}`}>
          Horas por trabajador: <b>{total.toLocaleString("es-ES", { maximumFractionDigits: 2 })}</b>
          {total > MAX_HORAS_DIA && <> · ⚠ pasa de {MAX_HORAS_DIA} h en un día</>}
          {sel.length > 0 && total > 0 && <> · total {(total * sel.length).toLocaleString("es-ES", { maximumFractionDigits: 2 })} h</>}
        </p>
        <label className="flex items-center gap-2 text-xs text-stone-600"><input type="checkbox" name="forzar" checked={forzar} onChange={(e) => setForzar(e.target.checked)} /> Registrar igualmente aunque alguien pase de {MAX_HORAS_DIA} h ese día</label>
      </section>
    </ActionForm>
  );
}
