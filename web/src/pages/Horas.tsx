import { useMemo, useState } from "react";
import { useAuth } from "../auth";
import { db } from "../supabase";
import { Field, useCarga } from "../ui";
import { CAMPOS_HORAS, MAX_HORAS_DIA, TAREAS_HORAS } from "../lib/horas";
import { registrarHoras } from "../lib/registrarHoras";
import { eur, fecha, iso, num } from "../lib/format";

type Trab = { id: string; codigo: string | null; nombre: string; finca_id: string | null };
type Variedad = { id: string; cultivo: string; variedad: string | null };
const dec = (v: string) => { const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const vacias = () => CAMPOS_HORAS.map(() => "");
const MOSTRAR = 300;

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
        {CAMPOS_HORAS.map((c, i) => (
          <Field key={c.etiqueta} label={c.etiqueta}><input inputMode="decimal" className="input" placeholder="0" value={horas[i]} onChange={(e) => setHoras((h) => h.map((x, j) => (j === i ? e.target.value : x)))} /></Field>
        ))}
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

export default function Horas() {
  const { puedeRegistrar, puedeGestionar } = useAuth();
  const [f, setF] = useState({ desde: "", hasta: "", trabajador: "", tarea: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const maestros = useCarga(async () => {
    const [t, v] = await Promise.all([
      db.from("trabajadores").select("id,codigo,nombre,finca_id").eq("activo", true).order("nombre"),
      db.from("cultivos_maestro").select("id,cultivo,variedad").eq("activo", true).order("cultivo").order("variedad"),
    ]);
    return { trab: (t.data ?? []) as Trab[], vars: (v.data ?? []) as Variedad[] };
  }, []);

  const lista = useCarga(async () => {
    let q = db.from("partes_trabajo")
      .select("id,fecha,horas_totales,horas_extra_totales,coste_total,tipo_trabajo,actividad,trabajador_nombre,trabajadores(codigo,nombre),fincas(nombre)")
      .order("fecha", { ascending: false }).limit(2000);
    if (f.desde) q = q.gte("fecha", f.desde);
    if (f.hasta) q = q.lte("fecha", f.hasta);
    if (f.trabajador) q = q.eq("trabajador_id", f.trabajador);
    if (f.tarea) q = q.eq("tipo_trabajo", f.tarea);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    // El tractor es del día y la finca (no del personal): se lista aparte y solo con filtro de fechas
    let tr: any[] = [];
    if (!f.trabajador && !f.tarea) {
      let qt = db.from("horas_tractor").select("id,fecha,horas,observaciones,fincas(nombre)").order("fecha", { ascending: false }).limit(500);
      if (f.desde) qt = qt.gte("fecha", f.desde);
      if (f.hasta) qt = qt.lte("fecha", f.hasta);
      tr = (await qt).data ?? [];
    }
    return { filas: (data ?? []) as any[], tr };
  }, [f.desde, f.hasta, f.trabajador, f.tarea]);

  const filas = lista.datos?.filas ?? [], tractores = lista.datos?.tr ?? [];
  const horas = filas.reduce((a, r) => a + Number(r.horas_totales ?? 0), 0);
  const coste = filas.reduce((a, r) => a + Number(r.coste_total ?? 0), 0);
  const sinTarifa = filas.filter((r) => r.coste_total == null).length;
  const horasTractor = tractores.reduce((a, r) => a + Number(r.horas ?? 0), 0);

  function csv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const n = (v: number) => String(v).replace(".", ",");
    const cab = ["Fecha", "Código", "Trabajador", "Finca", "Tarea", "Horas", "Horas extra", ...(puedeGestionar ? ["Coste (€)"] : [])];
    const lin = filas.map((r) => [fecha(r.fecha), r.trabajadores?.codigo ?? "", r.trabajadores?.nombre ?? r.trabajador_nombre ?? "", r.fincas?.nombre ?? "", [r.tipo_trabajo, r.actividad].filter(Boolean).join(" · "), n(Number(r.horas_totales ?? 0)), n(Number(r.horas_extra_totales ?? 0)), ...(puedeGestionar ? [r.coste_total == null ? "" : n(Number(r.coste_total))] : [])]);
    const blob = new Blob(["﻿" + [cab, ...lin].map((l) => l.map(esc).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "horas.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Horas</h1>
      {puedeRegistrar ? (
        <section className="card"><FormHoras trabajadores={maestros.datos?.trab ?? []} variedades={maestros.datos?.vars ?? []} alGuardar={lista.recargar} /></section>
      ) : <p className="text-sm text-stone-500">Tu rol solo permite consultar las horas.</p>}

      <div className="card grid gap-3 sm:grid-cols-4">
        <Field label="Desde"><input type="date" className="input" value={f.desde} onChange={set("desde")} /></Field>
        <Field label="Hasta"><input type="date" className="input" value={f.hasta} onChange={set("hasta")} /></Field>
        <Field label="Trabajador"><select className="input" value={f.trabajador} onChange={set("trabajador")}><option value="">Todos</option>{(maestros.datos?.trab ?? []).map((t) => <option key={t.id} value={t.id}>{t.codigo ? `${t.codigo} · ` : ""}{t.nombre}</option>)}</select></Field>
        <Field label="Tarea"><select className="input" value={f.tarea} onChange={set("tarea")}><option value="">Todas</option>{TAREAS_HORAS.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
      </div>

      {lista.error && <p role="alert" className="text-sm text-red-600">No se pudieron cargar las horas: {lista.error}</p>}
      <div className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
        <span>{filas.length} registros · <b>{num(horas, 2)} h</b>{puedeGestionar && <> · coste <b>{eur(coste)}</b>{sinTarifa > 0 && <span className="text-amber-600"> (parcial: {sinTarifa} sin tarifa)</span>}</>}</span>
        <button type="button" className="ml-auto text-brand-700 underline" onClick={csv}>⬇ CSV</button>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Fecha", "Código", "Trabajador", "Finca", "Tarea", "Horas", "Extra", ...(puedeGestionar ? ["Coste"] : [])].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {filas.slice(0, MOSTRAR).map((r) => (
              <tr key={r.id}>
                <td className="td">{fecha(r.fecha)}</td><td className="td">{r.trabajadores?.codigo ?? "—"}</td><td className="td">{r.trabajadores?.nombre ?? r.trabajador_nombre ?? "—"}</td>
                <td className="td">{r.fincas?.nombre}</td><td className="td">{r.tipo_trabajo ?? "—"}{r.actividad && <span className="text-xs text-stone-500"> · {r.actividad}</span>}</td>
                <td className="td">{num(r.horas_totales, 2)}</td><td className="td">{Number(r.horas_extra_totales) > 0 ? num(r.horas_extra_totales, 2) : "—"}</td>
                {puedeGestionar && <td className="td">{r.coste_total == null ? <span className="text-xs text-amber-600">sin tarifa</span> : eur(r.coste_total)}</td>}
              </tr>
            ))}
            {!filas.length && !lista.cargando && <tr><td className="td text-stone-500" colSpan={8}>Sin registros para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      {tractores.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <p className="px-3 pt-3 text-sm font-medium">🚜 Horas de tractor <span className="font-normal text-stone-500">· {num(horasTractor, 2)} h (por día y finca; no cuentan como horas del personal)</span></p>
          <table className="w-full">
            <thead><tr>{["Fecha", "Finca", "Horas", "Observaciones"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-stone-100">{tractores.map((r) => <tr key={r.id}><td className="td">{fecha(r.fecha)}</td><td className="td">{r.fincas?.nombre}</td><td className="td">{num(r.horas, 2)}</td><td className="td">{r.observaciones ?? "—"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {filas.length > MOSTRAR && <p className="text-xs text-stone-500">Se muestran los {MOSTRAR} más recientes de {filas.length}; el CSV lleva todos.</p>}
    </div>
  );
}
