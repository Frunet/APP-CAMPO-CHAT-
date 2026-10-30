import { Fragment, useState } from "react";
import { useAuth } from "../auth";
import { db } from "../supabase";
import { Field, msgError, useCarga } from "../ui";
import { CAMPOS_HORAS } from "../lib/horas";
import { fecha, iso, num } from "../lib/format";

type Parte = {
  id: string; fecha: string; finca_id: string; mayor: string | null; tipo_trabajo: string | null; actividad: string | null; num_trabajadores: number;
  horas_por_trabajador: number; horas_extra_por_trabajador: number; horas_totales: number; trabajador_id: string | null; trabajador_nombre: string | null;
  trabajadores: { codigo: string | null; nombre: string } | null; fincas: { nombre: string } | null;
};
type Tractor = { id: string; fecha: string; horas: number; observaciones: string | null; fincas: { nombre: string } | null };

const dec = (v: string) => { const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : NaN; };
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const KEEP = "keep";

/** Campo de horas que corresponde a la tarea (y subtipo) de un parte; «keep» si la tarea es antigua y no está en el catálogo. */
function campoDe(p: Parte): { sel: string; obs: string } {
  const i = CAMPOS_HORAS.findIndex((c) => c.tarea === p.tipo_trabajo && (!c.subtipo || (p.actividad ?? "").startsWith(c.subtipo)));
  if (i < 0) return { sel: KEEP, obs: p.actividad ?? "" };
  const c = CAMPOS_HORAS[i];
  const obs = c.subtipo ? (p.actividad ?? "").slice(c.subtipo.length).replace(/^\s*·\s*/, "") : p.actividad ?? "";
  return { sel: String(i), obs };
}
const nombreDe = (p: Parte) => p.trabajadores?.nombre ?? p.trabajador_nombre ?? (p.num_trabajadores > 1 ? `Sin nombre (${p.num_trabajadores} personas)` : "Sin nombre");

/** Una línea de horas (un parte): se puede modificar (tarea, horas, extra, observaciones) o eliminar. */
function FilaParte({ p, alCambiar }: { p: Parte; alCambiar: () => void }) {
  const ini = campoDe(p);
  const [editando, setEditando] = useState(false);
  const [sel, setSel] = useState(ini.sel);
  const [horas, setHoras] = useState(String(p.horas_por_trabajador));
  const [extra, setExtra] = useState(String(p.horas_extra_por_trabajador || ""));
  const [obs, setObs] = useState(ini.obs);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const nombre = nombreDe(p);

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
          <button type="button" className="text-sm text-brand-700 underline" onClick={() => setEditando(true)}>Editar</button>{" · "}
          <button type="button" className="text-sm text-red-600 underline disabled:opacity-50" disabled={ocupado} onClick={eliminar}>Eliminar</button>
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
              {CAMPOS_HORAS.map((c, i) => c.cosecha && ini.sel !== String(i) ? null : <option key={c.etiqueta} value={i}>{c.mayor} › {c.etiqueta}</option>)}
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

/** Fila de tractor con el mismo aspecto que la tabla verde. */
function FilaTractor({ t, editable, alCambiar }: { t: Tractor; editable: boolean; alCambiar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [horas, setHoras] = useState(String(t.horas));
  const [msg, setMsg] = useState<string | null>(null);
  async function guardar() {
    const h = dec(horas);
    if (!(h > 0 && h <= 24)) return setMsg("Entre 0 y 24 h");
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
      <td className="text-left">Tractor</td><td className="text-left">{t.fincas?.nombre}</td><td className="text-left">{t.observaciones ?? ""}</td>
      <td>{editando ? <input inputMode="decimal" className="input !w-20 !py-1" value={horas} onChange={(e) => setHoras(e.target.value)} /> : num(t.horas, 2)}</td>
      <td className="whitespace-nowrap">
        {editable && (editando
          ? <><button type="button" className="text-sm text-green-800 underline" onClick={guardar}>Guardar</button> · <button type="button" className="text-sm underline" onClick={() => setEditando(false)}>Cancelar</button></>
          : <><button type="button" className="text-sm text-green-800 underline" onClick={() => setEditando(true)}>Editar</button> · <button type="button" className="text-sm text-red-600 underline" onClick={eliminar}>Eliminar</button></>)}
        {msg && <span role="alert" className="block text-xs text-red-600">{msg}</span>}
      </td>
    </tr>
  );
}

const COLUMNAS: { mayor: string; pista: string }[] = [
  { mayor: "Instalaciones", pista: "obra, reparaciones…" },
  { mayor: "Suelos", pista: "desbrozadora, tractor…" },
  { mayor: "Liado y guiado", pista: "" },
  { mayor: "Otros cuidados de planta", pista: "poda, foliares…" },
  { mayor: "Riego", pista: "" },
  { mayor: "Cosecha", pista: "recolección" },
  { mayor: "Otros", pista: "" },
  { mayor: "Revisión finca", pista: "" },
];
const SIN_MAYOR = "Sin clasificar";
const IconoEditar = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

type Fila = { clave: string; nombre: string; codigo: string | null; finca: string; total: number; extra: number; por: Map<string, number>; lineas: Parte[] };

/** Líneas de un trabajador en el día elegido, para modificarlas o eliminarlas (en la tabla y en la tarjeta del móvil). */
function Detalle({ f, alCambiar, eliminarTodo }: { f: Fila; alCambiar: () => void; eliminarTodo: (f: Fila) => void }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr>{["Código", "Trabajador", "Finca", "Tarea", "Horas", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">{f.lineas.map((l) => <FilaParte key={l.id} p={l} alCambiar={alCambiar} />)}</tbody>
        </table>
      </div>
      <button type="button" className="mt-2 text-sm text-red-600 underline" onClick={() => eliminarTodo(f)}>Eliminar todo lo de {f.nombre} este día</button>
    </>
  );
}

/**
 * Revisión de lo registrado en los últimos 7 días, con el aspecto de AppCampo/Frunet: eliges el día y ves una fila por trabajador
 * con sus horas por mayor; el lápiz abre sus líneas para corregirlas o eliminarlas.
 */
export default function Ultimos7() {
  const { puedeRegistrar } = useAuth();
  const hoy = new Date();
  const desde = iso(new Date(hoy.getTime() - 6 * 864e5)), hasta = iso(hoy);
  const [dia, setDia] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  const { datos, error, cargando, recargar } = useCarga(async () => {
    const [a, b] = await Promise.all([
      db.from("partes_trabajo")
        .select("id,fecha,finca_id,mayor,tipo_trabajo,actividad,num_trabajadores,horas_por_trabajador,horas_extra_por_trabajador,horas_totales,trabajador_id,trabajador_nombre,trabajadores(codigo,nombre),fincas(nombre)")
        .gte("fecha", desde).lte("fecha", hasta).order("created_at", { ascending: false }).limit(2000),
      db.from("horas_tractor").select("id,fecha,horas,observaciones,fincas(nombre)").gte("fecha", desde).lte("fecha", hasta),
    ]);
    if (a.error) throw new Error(a.error.message);
    return { partes: (a.data ?? []) as unknown as Parte[], tractor: (b.data ?? []) as unknown as Tractor[] };
  }, []);

  const partes = datos?.partes ?? [], tractor = datos?.tractor ?? [];
  const dias = [...new Set([...partes.map((p) => p.fecha), ...tractor.map((t) => t.fecha)])].sort().reverse();
  const ultimos7 = Array.from({ length: 7 }, (_, i) => iso(new Date(hoy.getTime() - i * 864e5))).reverse(); // del más antiguo al de hoy
  const elegido = dia && ultimos7.includes(dia) ? dia : dias[0] ?? hasta;
  const trDia = tractor.filter((t) => t.fecha === elegido);

  // una fila por trabajador y finca
  const mapa = new Map<string, Fila>();
  for (const p of partes.filter((x) => x.fecha === elegido)) {
    const clave = `${p.trabajador_id ?? p.trabajador_nombre ?? "sin"}|${p.finca_id}`;
    const f: Fila = mapa.get(clave) ?? { clave, nombre: nombreDe(p), codigo: p.trabajadores?.codigo ?? null, finca: p.fincas?.nombre ?? "", total: 0, extra: 0, por: new Map(), lineas: [] };
    const h = Number(p.horas_totales ?? 0);
    f.total += h; f.extra += Number(p.horas_extra_por_trabajador ?? 0) * p.num_trabajadores;
    const m = p.mayor ?? SIN_MAYOR;
    f.por.set(m, (f.por.get(m) ?? 0) + h);
    f.lineas.push(p); mapa.set(clave, f);
  }
  const lista = [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const cols = lista.some((f) => f.por.has(SIN_MAYOR)) ? [...COLUMNAS, { mayor: SIN_MAYOR, pista: "" }] : COLUMNAS;
  const celda = (v?: number) => (v ? <b>{num(v, 2)}</b> : <span className="text-stone-300">0</span>);
  const anchoTabla = 4 + cols.length;

  async function eliminarTodo(f: Fila) {
    if (!window.confirm(`¿Eliminar TODAS las líneas de ${f.nombre} del ${fecha(elegido)} en ${f.finca} (${num(f.total, 2)} h)?`)) return;
    const { error } = await db.from("partes_trabajo").delete().in("id", f.lineas.map((l) => l.id));
    if (error) return window.alert(msgError(error));
    setAbierto(null); recargar();
  }

  return (
    <div>
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="fr-etiqueta">Selecciona una fecha</span>
            <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap">
              {ultimos7.map((d) => {
                const h = partes.filter((p) => p.fecha === d).reduce((a, p) => a + Number(p.horas_totales ?? 0), 0);
                const f = new Date(d + "T00:00:00");
                return (
                  <button key={d} type="button" className={`fr-dia ${d === elegido ? "fr-dia-activo" : ""} ${!dias.includes(d) ? "fr-dia-vacio" : ""}`} onClick={() => { setDia(d); setAbierto(null); }}>
                    <span>{DIAS[f.getDay()].slice(0, 3)} {f.getDate()}/{f.getMonth() + 1}</span>
                    <small>{dias.includes(d) ? `${num(h, 0)} h` : "sin datos"}</small>
                  </button>
                );
              })}
            </div>
          </div>
          {puedeRegistrar && <a href="#/horas" className="fr-boton">Pulse aquí para añadir horas</a>}
        </div>

        {error && <p role="alert" className="rounded bg-white px-3 py-2 text-sm text-red-600">{error}</p>}
        {cargando && !datos && <p className="fr-etiqueta">Cargando…</p>}
        {!dias.length && !cargando && <p className="rounded bg-white/90 px-3 py-2 text-sm">No hay registros en los últimos 7 días ({fecha(desde)} – {fecha(hasta)}).</p>}

        {elegido && !lista.length && !cargando && dias.includes(elegido) && trDia.length === 0 && <p className="rounded bg-white/90 px-3 py-2 text-sm">Sin registros este día.</p>}
        {elegido && !dias.includes(elegido) && !cargando && <p className="rounded bg-white/90 px-3 py-2 text-sm">No hay nada registrado el {fecha(elegido)}.</p>}

        {elegido && lista.length > 0 && (
          <>
          <div className="hidden overflow-x-auto sm:block">
            <table className="fr-tabla w-full">
              <thead>
                <tr>
                  <th className="w-14" />
                  <th className="fr-fecha">{fecha(elegido)}</th>
                  <th>Horas diarias</th>
                  <th>Finca</th>
                  {cols.map((c) => <th key={c.mayor}>{c.mayor}{c.pista && <small>({c.pista})</small>}</th>)}
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => (
                  <Fragment key={f.clave}>
                    <tr>
                      <td className="text-center">
                        {puedeRegistrar
                          ? <button type="button" title="Modificar o eliminar" aria-label={`Modificar o eliminar ${f.nombre}`} className="fr-lapiz" onClick={() => setAbierto(abierto === f.clave ? null : f.clave)}><IconoEditar /></button>
                          : <span className="text-stone-300">—</span>}
                      </td>
                      <td className="text-left">{f.nombre}{f.codigo && <span> ({f.codigo})</span>}</td>
                      <td>{num(f.total, 2)}{f.extra > 0 && <small className="!inline ml-1 !text-amber-700">({num(f.extra, 2)} extra)</small>}</td>
                      <td className="text-left">{f.finca}</td>
                      {cols.map((c) => <td key={c.mayor}>{celda(f.por.get(c.mayor))}</td>)}
                    </tr>
                    {abierto === f.clave && (
                      <tr>
                        <td colSpan={anchoTabla} className="!bg-white/95 !p-3 text-left">
                          <Detalle f={f} alCambiar={recargar} eliminarTodo={eliminarTodo} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                <tr className="fr-total">
                  <td /><td className="text-left">Total del día</td><td>{num(lista.reduce((a, f) => a + f.total, 0), 2)}</td><td />
                  {cols.map((c) => <td key={c.mayor}>{celda(lista.reduce((a, f) => a + (f.por.get(c.mayor) ?? 0), 0))}</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Móvil: una tarjeta por trabajador, con solo los mayores en los que tiene horas */}
          <div className="space-y-3 sm:hidden">
            {lista.map((f) => (
              <div key={f.clave} className="card">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold">{f.nombre}{f.codigo && <span className="font-semibold text-stone-500"> ({f.codigo})</span>}</p>
                    <p className="text-sm text-stone-600">{f.finca} · <b className="text-base text-stone-900">{num(f.total, 2)} h</b>{f.extra > 0 && <span className="text-amber-700"> ({num(f.extra, 2)} extra)</span>}</p>
                  </div>
                  {puedeRegistrar && <button type="button" aria-label={`Modificar o eliminar ${f.nombre}`} className="fr-lapiz" onClick={() => setAbierto(abierto === f.clave ? null : f.clave)}><IconoEditar /></button>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cols.filter((c) => f.por.get(c.mayor)).map((c) => <span key={c.mayor} className="fr-chip">{c.mayor} <b>{num(f.por.get(c.mayor), 2)}</b></span>)}
                </div>
                {abierto === f.clave && <div className="mt-3 border-t border-stone-200 pt-3"><Detalle f={f} alCambiar={recargar} eliminarTodo={eliminarTodo} /></div>}
              </div>
            ))}
            <div className="card flex items-center justify-between font-extrabold" style={{ background: "#e8f6e7" }}>
              <span>Total del día</span><span>{num(lista.reduce((a, f) => a + f.total, 0), 2)} h</span>
            </div>
          </div>
          </>
        )}

        {trDia.length > 0 && (
          <div className="overflow-x-auto">
            <table className="fr-tabla w-full">
              <thead><tr><th className="text-left">🚜 Tractor del día (de la finca, no del personal)</th><th>Finca</th><th>Observaciones</th><th>Horas</th><th /></tr></thead>
              <tbody>{trDia.map((t) => <FilaTractor key={t.id} t={t} editable={puedeRegistrar} alCambiar={recargar} />)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
