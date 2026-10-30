import { useState } from "react";
import { useAuth } from "../auth";
import { db } from "../supabase";
import { Field, msgError, useCarga } from "../ui";
import { CAMPOS_HORAS } from "../lib/horas";
import { fecha, iso, num } from "../lib/format";

type Parte = {
  id: string; fecha: string; finca_id: string; mayor: string | null; tipo_trabajo: string | null; actividad: string | null; num_trabajadores: number;
  horas_por_trabajador: number; horas_extra_por_trabajador: number; horas_totales: number; trabajador_nombre: string | null;
  trabajadores: { codigo: string | null; nombre: string } | null; fincas: { nombre: string } | null;
};
type Tractor = { id: string; fecha: string; horas: number; observaciones: string | null; fincas: { nombre: string } | null };

const dec = (v: string) => { const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : NaN; };
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const KEEP = "keep";

/** Índice del campo de horas que corresponde a la tarea (y subtipo) de un parte; «keep» si la tarea es antigua y no está en el catálogo. */
function campoDe(p: Parte): { sel: string; obs: string } {
  const i = CAMPOS_HORAS.findIndex((c) => c.tarea === p.tipo_trabajo && (!c.subtipo || (p.actividad ?? "").startsWith(c.subtipo)));
  if (i < 0) return { sel: KEEP, obs: p.actividad ?? "" };
  const c = CAMPOS_HORAS[i];
  const obs = c.subtipo ? (p.actividad ?? "").slice(c.subtipo.length).replace(/^\s*·\s*/, "") : p.actividad ?? "";
  return { sel: String(i), obs };
}

function FilaParte({ p, editable, alCambiar }: { p: Parte; editable: boolean; alCambiar: () => void }) {
  const ini = campoDe(p);
  const [editando, setEditando] = useState(false);
  const [sel, setSel] = useState(ini.sel);
  const [horas, setHoras] = useState(String(p.horas_por_trabajador));
  const [extra, setExtra] = useState(String(p.horas_extra_por_trabajador || ""));
  const [obs, setObs] = useState(ini.obs);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const nombre = p.trabajadores?.nombre ?? p.trabajador_nombre ?? (p.num_trabajadores > 1 ? `Sin nombre (${p.num_trabajadores} personas)` : "Sin nombre");

  async function guardar() {
    const h = dec(horas), e = extra.trim() ? dec(extra) : 0;
    if (!(h > 0 && h <= 24)) return setMsg("Las horas deben estar entre 0 y 24");
    if (Number.isNaN(e) || e < 0 || e > h) return setMsg("Las horas extra no pueden superar las horas");
    const cambios: Record<string, unknown> = { horas_por_trabajador: h, horas_extra_por_trabajador: e };
    if (sel === KEEP) cambios.actividad = obs.trim() || null;
    else { const c = CAMPOS_HORAS[Number(sel)]; cambios.tipo_trabajo = c.tarea; cambios.mayor = c.mayor; cambios.actividad = [c.subtipo, obs.trim()].filter(Boolean).join(" · ") || null; }
    setOcupado(true); setMsg(null);
    const { data, error } = await db.from("partes_trabajo").update(cambios).eq("id", p.id).select("id");
    setOcupado(false);
    if (error) return setMsg(msgError(error));
    if (!data?.length) return setMsg("No se pudo modificar (¿no tienes permiso sobre esta finca?)");
    setEditando(false); alCambiar();
  }
  async function eliminar() {
    if (!window.confirm(`¿Eliminar las ${num(p.horas_totales, 2)} h de ${nombre} del ${fecha(p.fecha)} (${p.tipo_trabajo ?? "sin tarea"})?`)) return;
    setOcupado(true);
    const { data, error } = await db.from("partes_trabajo").delete().eq("id", p.id).select("id");
    setOcupado(false);
    if (error) return setMsg(msgError(error));
    if (!data?.length) return setMsg("No se pudo eliminar (solo se pueden borrar los registros de los últimos 7 días de tus fincas)");
    alCambiar();
  }

  if (!editando) {
    return (
      <tr>
        <td className="td font-mono text-xs">{p.trabajadores?.codigo ?? "—"}</td><td className="td">{nombre}</td><td className="td">{p.fincas?.nombre}</td>
        <td className="td">{p.tipo_trabajo ?? "—"}{p.mayor && <span className="block text-xs text-stone-400">{p.mayor}</span>}{p.actividad && <span className="block text-xs text-stone-500">{p.actividad}</span>}</td>
        <td className="td whitespace-nowrap">{num(p.horas_totales, 2)}{Number(p.horas_extra_por_trabajador) > 0 && <span className="text-xs text-amber-700"> ({num(p.horas_extra_por_trabajador * p.num_trabajadores, 2)} extra)</span>}</td>
        <td className="td whitespace-nowrap text-right">
          {editable && <><button type="button" className="text-sm text-brand-700 underline" onClick={() => setEditando(true)}>Editar</button>{" · "}<button type="button" className="text-sm text-red-600 underline disabled:opacity-50" disabled={ocupado} onClick={eliminar}>Eliminar</button></>}
          {msg && <span role="alert" className="block text-xs text-red-600">{msg}</span>}
        </td>
      </tr>
    );
  }
  return (
    <tr className="bg-amber-50/60">
      <td className="td font-mono text-xs">{p.trabajadores?.codigo ?? "—"}</td><td className="td">{nombre}</td><td className="td">{p.fincas?.nombre}</td>
      <td className="td" colSpan={3}>
        <div className="grid gap-2 sm:grid-cols-4">
          <Field label="Tarea">
            <select className="input" value={sel} onChange={(e) => setSel(e.target.value)}>
              {ini.sel === KEEP && <option value={KEEP}>Mantener: {p.tipo_trabajo ?? "sin tarea"}</option>}
              {CAMPOS_HORAS.map((c, i) => c.cosecha ? null : <option key={c.etiqueta} value={i}>{c.mayor} › {c.etiqueta}</option>)}
              {ini.sel !== KEEP && CAMPOS_HORAS[Number(ini.sel)]?.cosecha && <option value={ini.sel}>Cosecha</option>}
            </select>
          </Field>
          <Field label="Horas"><input inputMode="decimal" className="input" value={horas} onChange={(e) => setHoras(e.target.value)} /></Field>
          <Field label="De ellas, extra"><input inputMode="decimal" className="input" value={extra} onChange={(e) => setExtra(e.target.value)} /></Field>
          <Field label="Observaciones"><input className="input" maxLength={400} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn !py-1" disabled={ocupado} onClick={guardar}>{ocupado ? "Guardando…" : "Guardar"}</button>
          <button type="button" className="btn-ghost !py-1" onClick={() => { setEditando(false); setMsg(null); }}>Cancelar</button>
          {msg && <span role="alert" className="text-xs text-red-600">{msg}</span>}
        </div>
      </td>
    </tr>
  );
}

function FilaTractor({ t, editable, alCambiar }: { t: Tractor; editable: boolean; alCambiar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [horas, setHoras] = useState(String(t.horas));
  const [msg, setMsg] = useState<string | null>(null);
  async function guardar() {
    const h = dec(horas);
    if (!(h > 0 && h <= 24)) return setMsg("Las horas deben estar entre 0 y 24");
    const { data, error } = await db.from("horas_tractor").update({ horas: h }).eq("id", t.id).select("id");
    if (error) return setMsg(msgError(error));
    if (!data?.length) return setMsg("No se pudo modificar");
    setEditando(false); alCambiar();
  }
  async function eliminar() {
    if (!window.confirm(`¿Eliminar las ${num(t.horas, 2)} h de tractor del ${fecha(t.fecha)} en ${t.fincas?.nombre}?`)) return;
    const { error } = await db.from("horas_tractor").delete().eq("id", t.id);
    if (error) return setMsg(msgError(error));
    alCambiar();
  }
  return (
    <tr>
      <td className="td text-xs text-stone-400">—</td><td className="td">🚜 Tractor del día</td><td className="td">{t.fincas?.nombre}</td><td className="td text-xs text-stone-500">{t.observaciones}</td>
      <td className="td whitespace-nowrap">{editando ? <input inputMode="decimal" className="input !w-20 !py-1" value={horas} onChange={(e) => setHoras(e.target.value)} /> : num(t.horas, 2)}</td>
      <td className="td whitespace-nowrap text-right">
        {editable && (editando
          ? <><button type="button" className="text-sm text-brand-700 underline" onClick={guardar}>Guardar</button>{" · "}<button type="button" className="text-sm underline" onClick={() => setEditando(false)}>Cancelar</button></>
          : <><button type="button" className="text-sm text-brand-700 underline" onClick={() => setEditando(true)}>Editar</button>{" · "}<button type="button" className="text-sm text-red-600 underline" onClick={eliminar}>Eliminar</button></>)}
        {msg && <span role="alert" className="block text-xs text-red-600">{msg}</span>}
      </td>
    </tr>
  );
}

/** Revisión de lo registrado en los últimos 7 días: por día, con código, nombre y tarea de cada trabajador, para corregir o eliminar. */
export default function Ultimos7() {
  const { puedeRegistrar, fincas } = useAuth();
  const [finca, setFinca] = useState("");
  const [buscar, setBuscar] = useState("");
  const hoy = new Date();
  const desde = iso(new Date(hoy.getTime() - 6 * 864e5)), hasta = iso(hoy);

  const { datos, error, cargando, recargar } = useCarga(async () => {
    let q = db.from("partes_trabajo")
      .select("id,fecha,finca_id,mayor,tipo_trabajo,actividad,num_trabajadores,horas_por_trabajador,horas_extra_por_trabajador,horas_totales,trabajador_nombre,trabajadores(codigo,nombre),fincas(nombre)")
      .gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
    let qt = db.from("horas_tractor").select("id,fecha,horas,observaciones,fincas(nombre)").gte("fecha", desde).lte("fecha", hasta);
    if (finca) { q = q.eq("finca_id", finca); qt = qt.eq("finca_id", finca); }
    const [a, b] = await Promise.all([q, qt]);
    if (a.error) throw new Error(a.error.message);
    return { partes: (a.data ?? []) as unknown as Parte[], tractor: (b.data ?? []) as unknown as Tractor[] };
  }, [finca]);

  const txt = buscar.trim().toLowerCase();
  const partes = (datos?.partes ?? []).filter((p) => !txt || `${p.trabajadores?.codigo ?? ""} ${p.trabajadores?.nombre ?? p.trabajador_nombre ?? ""}`.toLowerCase().includes(txt));
  const tractor = txt ? [] : datos?.tractor ?? [];
  const dias = [...new Set([...partes.map((p) => p.fecha), ...tractor.map((t) => t.fecha)])].sort().reverse();
  const horasTotal = partes.reduce((a, p) => a + Number(p.horas_totales ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Últimos 7 días</h1>
        <p className="text-sm text-stone-500">Lo registrado del {fecha(desde)} al {fecha(hasta)}. {puedeRegistrar ? "Puedes modificar las horas y la tarea de un registro o eliminarlo; todo queda en el historial de auditoría." : "Solo consulta."}</p>
      </div>

      <div className="card grid gap-3 sm:grid-cols-3">
        <Field label="Finca"><select className="input" value={finca} onChange={(e) => setFinca(e.target.value)}><option value="">Todas</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
        <Field label="Buscar trabajador (código o nombre)"><input className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Ej.: 3004 o García" /></Field>
        <p className="self-end pb-2 text-sm text-stone-600">{partes.length} registros · <b>{num(horasTotal, 2)} h</b></p>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {cargando && !datos && <p className="text-sm text-stone-500">Cargando…</p>}

      {dias.map((d) => {
        const del = partes.filter((p) => p.fecha === d), tr = tractor.filter((t) => t.fecha === d);
        const nombreDia = DIAS[new Date(d + "T00:00:00").getDay()];
        return (
          <section key={d} className="card overflow-x-auto p-0">
            <h2 className="border-b border-stone-100 px-3 py-2 text-sm font-semibold capitalize">{nombreDia} {fecha(d)} <span className="font-normal normal-case text-stone-500">· {del.length} registros · {num(del.reduce((a, p) => a + Number(p.horas_totales ?? 0), 0), 2)} h</span></h2>
            <table className="w-full">
              <thead><tr>{["Código", "Trabajador", "Finca", "Tarea", "Horas", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-stone-100">
                {del.map((p) => <FilaParte key={p.id} p={p} editable={puedeRegistrar} alCambiar={recargar} />)}
                {tr.map((t) => <FilaTractor key={t.id} t={t} editable={puedeRegistrar} alCambiar={recargar} />)}
              </tbody>
            </table>
          </section>
        );
      })}
      {!dias.length && !cargando && <p className="card text-sm text-stone-500">No hay registros en los últimos 7 días.</p>}
    </div>
  );
}
