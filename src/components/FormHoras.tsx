"use client";
import { useMemo, useState } from "react";
import ActionForm, { Field } from "./ActionForm";
import { registrarHoras } from "@/lib/actions";
import { CAMPOS_HORAS, MAX_HORAS_DIA } from "@/lib/horas";

type Trab = { id: string; codigo: string | null; nombre: string; finca_id: string | null };
type Finca = { id: string; nombre: string };
type Variedad = { id: string; cultivo: string; variedad: string | null };

const num = (v: string) => { const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const vacias = () => CAMPOS_HORAS.map(() => "");

/**
 * Registro de horas: se marcan los trabajadores (buscando por código o nombre), se elige finca y fecha y se escriben las horas de cada tarea
 * (un campo por tarea; Hierba y Reparaciones, uno por subtipo). Kg y variedad solo aparecen —y son obligatorios— cuando hay horas de Cosecha.
 */
export default function FormHoras({ fincas, trabajadores, variedades, hoy }: { fincas: Finca[]; trabajadores: Trab[]; variedades: Variedad[]; hoy: string }) {
  const [finca, setFinca] = useState(fincas.length === 1 ? fincas[0].id : "");
  const [fecha, setFecha] = useState(hoy);
  const [actividad, setActividad] = useState("");
  const [forzar, setForzar] = useState(false);
  const [tick, setTick] = useState(0); // React reinicia el formulario tras cada envío: se vuelve a pintar para que lo marcado siga marcado
  const [buscar, setBuscar] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [horas, setHoras] = useState<string[]>(vacias());
  const [extra, setExtra] = useState("");
  const [kg, setKg] = useState("");
  const [variedad, setVariedad] = useState("");
  const total = horas.reduce((a, h) => a + num(h), 0);
  const extraN = num(extra);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return trabajadores.filter((t) => (!finca || !t.finca_id || t.finca_id === finca) && (!q || `${t.codigo ?? ""} ${t.nombre}`.toLowerCase().includes(q)));
  }, [trabajadores, finca, buscar]);
  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <ActionForm
      action={async (fd) => { const r = await registrarHoras(fd); setTick((t) => t + 1); return r; }}
      label="Añadir" reset={false} className="space-y-4"
      alTerminar={() => { setSel([]); setHoras(vacias()); setExtra(""); setKg(""); setVariedad(""); setActividad(""); setForzar(false); }}>
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

        {CAMPOS_HORAS.map((c, i) => (
          <Field key={c.etiqueta} label={c.etiqueta}>
            <input name={`h${i}`} inputMode="decimal" className="input" placeholder="0" value={horas[i]} onChange={(e) => setHoras((h) => h.map((x, j) => (j === i ? e.target.value : x)))} />
          </Field>
        ))}

        {CAMPOS_HORAS.some((c, i) => c.cosecha && num(horas[i]) > 0) && (
          <>
            <Field label="Kg cosechados *"><input name={`kg${CAMPOS_HORAS.findIndex((c) => c.cosecha)}`} inputMode="decimal" className="input" required value={kg} onChange={(e) => setKg(e.target.value)} /></Field>
            <Field label="Variedad *">
              <select name={`var${CAMPOS_HORAS.findIndex((c) => c.cosecha)}`} className="input" required value={variedad} onChange={(e) => setVariedad(e.target.value)}>
                <option value="">Elige…</option>{variedades.map((v) => <option key={v.id} value={v.id}>{v.cultivo}{v.variedad ? ` · ${v.variedad}` : ""}</option>)}
              </select>
            </Field>
          </>
        )}

        <Field label="De ellas, horas extra (por trabajador)"><input name="extra" inputMode="decimal" className={`input ${extraN > total ? "!border-red-400" : ""}`} placeholder="0" value={extra} onChange={(e) => setExtra(e.target.value)} /></Field>
        <Field label="Observaciones" wide><input name="actividad" className="input" placeholder="Escriba aquí…" maxLength={400} value={actividad} onChange={(e) => setActividad(e.target.value)} /></Field>

        <p className={`col-span-full text-sm ${total > MAX_HORAS_DIA ? "font-semibold text-amber-700" : "text-stone-600"}`}>
          Horas por trabajador: <b>{total.toLocaleString("es-ES", { maximumFractionDigits: 2 })}</b>
          {extraN > 0 && <> (de ellas {extraN.toLocaleString("es-ES")} extra)</>}
          {extraN > total && <span className="text-red-600"> · las extra no pueden superar el total</span>}
          {total > MAX_HORAS_DIA && <> · ⚠ pasa de {MAX_HORAS_DIA} h en un día</>}
          {sel.length > 0 && total > 0 && <> · total {(total * sel.length).toLocaleString("es-ES", { maximumFractionDigits: 2 })} h</>}
        </p>
        <label className="col-span-full flex items-center gap-2 text-xs text-stone-600"><input type="checkbox" name="forzar" checked={forzar} onChange={(e) => setForzar(e.target.checked)} /> Registrar igualmente aunque alguien pase de {MAX_HORAS_DIA} h ese día</label>
      </section>
    </ActionForm>
  );
}
