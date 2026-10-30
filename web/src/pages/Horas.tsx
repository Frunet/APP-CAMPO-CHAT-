import { useMemo, useState } from "react";
import { useAuth } from "../auth";
import { db } from "../supabase";
import { Field, useCarga } from "../ui";
import { CAMPOS_HORAS, MAX_HORAS_DIA, NOMBRES_MAYOR } from "../lib/horas";
import { registrarHoras } from "../lib/registrarHoras";
import { iso } from "../lib/format";

type Trab = { id: string; codigo: string | null; nombre: string; finca_id: string | null };
type Variedad = { id: string; cultivo: string; variedad: string | null };
const dec = (v: string) => { const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const vacias = () => CAMPOS_HORAS.map(() => "");

function FormHoras({ trabajadores, variedades, alGuardar }: { trabajadores: Trab[]; variedades: Variedad[]; alGuardar: () => void }) {
  const { fincas } = useAuth();
  const hoy = iso(new Date());
  const [finca, setFinca] = useState("");
  const [fechaD, setFecha] = useState(hoy);
  const [buscar, setBuscar] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [horas, setHoras] = useState<string[]>(vacias());
  const [extra, setExtra] = useState("");
  const [tractor, setTractor] = useState("");
  const [kg, setKg] = useState("");
  const [variedad, setVariedad] = useState("");
  const [actividad, setActividad] = useState("");
  const [forzar, setForzar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const fincaEf = finca || (fincas.length === 1 ? fincas[0].id : "");
  const total = horas.reduce((a, h) => a + dec(h), 0), extraN = dec(extra);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return trabajadores.filter((t) => (!fincaEf || !t.finca_id || t.finca_id === fincaEf) && (!q || `${t.codigo ?? ""} ${t.nombre}`.toLowerCase().includes(q)));
  }, [trabajadores, fincaEf, buscar]);
  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const iCosecha = CAMPOS_HORAS.findIndex((c) => c.cosecha);

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setOcupado(true); setMsg(null);
    try {
      const ok = await registrarHoras({ finca_id: fincaEf, fecha: fechaD, trabajadores: sel, horas, extra, tractor, kg, variedad, actividad, forzar });
      setMsg({ ok });
      setSel([]); setHoras(vacias()); setExtra(""); setTractor(""); setKg(""); setVariedad(""); setActividad(""); setForzar(false);
      alGuardar();
    } catch (e) { setMsg({ error: (e as Error).message }); }
    setOcupado(false);
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <section className="rounded-lg border border-stone-200 p-3">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide">Seleccione a los empleados <span className="font-normal normal-case text-stone-500">({sel.length} marcados)</span></p>
        <input className="input mb-2" placeholder="Buscar por código o nombre…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <div className="max-h-56 overflow-y-auto rounded-lg border border-stone-200">
          {visibles.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-3 border-b border-stone-100 px-3 py-2 text-sm last:border-0">
              <input type="checkbox" checked={sel.includes(t.id)} onChange={() => alternar(t.id)} className="h-5 w-5" />
              {t.codigo && <span className="font-mono text-xs text-stone-500">{t.codigo}</span>}<span>{t.nombre}</span>
            </label>
          ))}
          {!visibles.length && <p className="p-3 text-sm text-stone-500">No hay trabajadores{buscar ? " con ese texto" : ""}.</p>}
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-stone-200 p-3 sm:grid-cols-3">
        <Field label="Finca *"><select className="input" required value={fincaEf} onChange={(e) => setFinca(e.target.value)}><option value="">Elige…</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
        <Field label="Fecha *"><input type="date" className="input" required value={fechaD} max={hoy} onChange={(e) => setFecha(e.target.value)} /></Field>
        <div className="hidden sm:block" />
        {NOMBRES_MAYOR.map((m) => {
          const campos = CAMPOS_HORAS.map((c, i) => ({ c, i })).filter((x) => x.c.mayor === m);
          if (!campos.length) return null; // un mayor sin tareas aún no admite horas
          return (
            <fieldset key={m} className="col-span-full grid gap-3 rounded-lg bg-stone-50 p-3 sm:grid-cols-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-700">{m}</legend>
              {campos.map(({ c, i }) => (
                <Field key={c.etiqueta} label={c.etiqueta}><input inputMode="decimal" className="input" placeholder="0" value={horas[i]} onChange={(e) => setHoras((h) => h.map((x, j) => (j === i ? e.target.value : x)))} /></Field>
              ))}
            </fieldset>
          );
        })}
        {iCosecha >= 0 && dec(horas[iCosecha]) > 0 && (
          <>
            <Field label="Kg cosechados *"><input inputMode="decimal" className="input" required value={kg} onChange={(e) => setKg(e.target.value)} /></Field>
            <Field label="Variedad *"><select className="input" required value={variedad} onChange={(e) => setVariedad(e.target.value)}><option value="">Elige…</option>{variedades.map((v) => <option key={v.id} value={v.id}>{v.cultivo}{v.variedad ? ` · ${v.variedad}` : ""}</option>)}</select></Field>
          </>
        )}
        <Field label="🚜 Tractor: horas del día (de la finca, no del personal)"><input inputMode="decimal" className="input" placeholder="0" value={tractor} onChange={(e) => setTractor(e.target.value)} /></Field>
        <Field label="De ellas, horas extra (por trabajador)"><input inputMode="decimal" className={`input ${extraN > total ? "!border-red-400" : ""}`} placeholder="0" value={extra} onChange={(e) => setExtra(e.target.value)} /></Field>
        <Field label="Observaciones" wide><input className="input" placeholder="Escriba aquí…" maxLength={400} value={actividad} onChange={(e) => setActividad(e.target.value)} /></Field>
        <p className={`col-span-full text-sm ${total > MAX_HORAS_DIA ? "font-semibold text-amber-700" : "text-stone-600"}`}>
          Horas por trabajador: <b>{total.toLocaleString("es-ES", { maximumFractionDigits: 2 })}</b>
          {extraN > 0 && <> (de ellas {extraN.toLocaleString("es-ES")} extra)</>}
          {extraN > total && <span className="text-red-600"> · las extra no pueden superar el total</span>}
          {total > MAX_HORAS_DIA && <> · ⚠ pasa de {MAX_HORAS_DIA} h en un día</>}
          {sel.length > 0 && total > 0 && <> · total {(total * sel.length).toLocaleString("es-ES", { maximumFractionDigits: 2 })} h</>}
        </p>
        <label className="col-span-full flex items-center gap-2 text-xs text-stone-600"><input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} /> Registrar igualmente aunque alguien pase de {MAX_HORAS_DIA} h ese día</label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={ocupado}>{ocupado ? "Guardando…" : "Añadir"}</button>
        {msg?.error && <span role="alert" className="text-sm text-red-600">{msg.error}</span>}
        {msg?.ok && <span role="status" className="text-sm text-green-700">{msg.ok}</span>}
      </div>
    </form>
  );
}

/** Registro de horas: solo el formulario. Para revisar, corregir o eliminar lo registrado está «Últimos 7 días»; para totales por trabajador, «Nóminas». */
export default function Horas() {
  const { puedeRegistrar } = useAuth();
  const maestros = useCarga(async () => {
    const [t, v] = await Promise.all([
      db.from("trabajadores").select("id,codigo,nombre,finca_id").eq("activo", true).order("nombre"),
      db.from("cultivos_maestro").select("id,cultivo,variedad").eq("activo", true).order("cultivo").order("variedad"),
    ]);
    return { trab: (t.data ?? []) as Trab[], vars: (v.data ?? []) as Variedad[] };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Horas</h1>
      {puedeRegistrar ? (
        <section className="card"><FormHoras trabajadores={maestros.datos?.trab ?? []} variedades={maestros.datos?.vars ?? []} alGuardar={() => {}} /></section>
      ) : <p className="text-sm text-stone-500">Tu rol solo permite consultar las horas: míralas en «Últimos 7 días».</p>}
    </div>
  );
}
