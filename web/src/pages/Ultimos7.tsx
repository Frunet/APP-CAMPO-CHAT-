import { Fragment, useState } from "react";
import { useAuth } from "../auth";
import { db } from "../supabase";
import { msgError, useCarga } from "../ui";
import EditarHoras from "../components/EditarHoras";
import { CAMPOS_HORAS } from "../lib/horas";
import { fecha, iso, num } from "../lib/format";

export type Parte = {
  id: string; updated_at: string; fecha: string; finca_id: string; mayor: string | null; tipo_trabajo: string | null; actividad: string | null; num_trabajadores: number;
  horas_por_trabajador: number; horas_extra_por_trabajador: number; horas_extra_manuales: number; horas_totales: number; trabajador_id: string | null; trabajador_nombre: string | null;
  trabajadores: { codigo: string | null; nombre: string } | null; fincas: { nombre: string } | null;
};
type Tractor = { id: string; fecha: string; horas: number; observaciones: string | null; fincas: { nombre: string } | null };

const dec = (v: string) => { const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : NaN; };
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const nombreDe = (p: Parte) => p.trabajadores?.nombre ?? p.trabajador_nombre ?? (p.num_trabajadores > 1 ? `Sin nombre (${p.num_trabajadores} personas)` : "Sin nombre");

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

/** Columnas: cada subtarea del catálogo («Reparaciones · Riego», «Hierba · Tractor», «Poda»…), sin agrupar por mayor. */
const COLUMNAS: { clave: string }[] = CAMPOS_HORAS.map((c) => ({ clave: c.etiqueta }));
const SIN_MAYOR = "Sin detallar";
/** Subtarea (columna) de un parte; las tareas antiguas que no están en el catálogo van a «Sin detallar». */
const subtareaDe = (p: Parte) => {
  const c = CAMPOS_HORAS.find((x) => x.tarea === p.tipo_trabajo && (!x.subtipo || (p.actividad ?? "").startsWith(x.subtipo)));
  return c ? c.etiqueta : SIN_MAYOR;
};
const IconoEditar = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

type Fila = { clave: string; nombre: string; codigo: string | null; finca: string; total: number; extra: number; por: Map<string, number>; lineas: Parte[] };

/**
 * Revisión de lo registrado en los últimos 7 días, con el aspecto de AppCampo/Frunet: eliges el día y ves una fila por trabajador
 * con sus horas por subtarea; el lápiz abre el formulario de horas cargado con sus tareas actuales.
 */
export default function Ultimos7() {
  const { puedeRegistrar } = useAuth();
  const hoy = new Date();
  const desde = iso(new Date(hoy.getTime() - 6 * 864e5)), hasta = iso(hoy);
  const [dia, setDia] = useState("");
  const [fincaFiltro, setFincaFiltro] = useState("");
  const [trabajadorFiltro, setTrabajadorFiltro] = useState("");
  const [tareaFiltro, setTareaFiltro] = useState("");
  const [editando, setEditando] = useState<Fila | null>(null);
  const [aviso, setAviso] = useState("");

  const { datos, error, cargando, recargar } = useCarga(async () => {
    const [a, b] = await Promise.all([
      db.from("partes_trabajo")
        .select("id,updated_at,fecha,finca_id,mayor,tipo_trabajo,actividad,num_trabajadores,horas_por_trabajador,horas_extra_por_trabajador,horas_extra_manuales,horas_totales,trabajador_id,trabajador_nombre,trabajadores(codigo,nombre),fincas(nombre)")
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
    const m = subtareaDe(p);
    f.por.set(m, (f.por.get(m) ?? 0) + h);
    f.lineas.push(p); mapa.set(clave, f);
  }
  const lista = [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const cols = lista.some((f) => f.por.has(SIN_MAYOR)) ? [...COLUMNAS, { clave: SIN_MAYOR }] : COLUMNAS;
  const fincasDisponibles = [...new Map(lista.map((f) => [f.finca, f.finca])).values()].sort((a, b) => a.localeCompare(b, "es"));
  const trabajadoresDisponibles = [...new Map(lista.map((f) => [f.nombre, f.nombre])).values()].sort((a, b) => a.localeCompare(b, "es"));
  const tareasDisponibles = [...new Set(lista.flatMap((f) => f.lineas.map((p) => p.tipo_trabajo?.trim() || p.mayor?.trim() || SIN_MAYOR)))].sort((a, b) => a.localeCompare(b, "es"));
  const listaFiltrada = lista.filter((f) => (!fincaFiltro || f.finca === fincaFiltro) && (!trabajadorFiltro || f.nombre === trabajadorFiltro) && (!tareaFiltro || f.lineas.some((p) => (p.tipo_trabajo?.trim() || p.mayor?.trim() || SIN_MAYOR) === tareaFiltro)));
  const celda = (v?: number) => (v ? <b>{num(v, 2)}</b> : <span className="text-stone-300">0</span>);

  async function eliminarTodo(f: Fila) {
    if (!window.confirm(`¿Eliminar TODAS las líneas de ${f.nombre} del ${fecha(elegido)} en ${f.finca} (${num(f.total, 2)} h)?`)) return;
    const { error } = await db.from("partes_trabajo").delete().in("id", f.lineas.map((l) => l.id));
    if (error) return window.alert(msgError(error));
    setEditando(null); recargar();
  }

  return (
    <div>
      {editando && <EditarHoras lineas={editando.lineas} nombre={editando.nombre} finca={editando.finca} actualizar={recargar} cerrar={() => setEditando(null)} alGuardar={() => { setEditando(null); setAviso("Horas modificadas correctamente."); recargar(); }} eliminar={() => eliminarTodo(editando)} />}
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="fr-etiqueta">Selecciona una fecha</span>
            <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap">
              {ultimos7.map((d) => {
                const h = partes.filter((p) => p.fecha === d).reduce((a, p) => a + Number(p.horas_totales ?? 0), 0);
                const f = new Date(d + "T00:00:00");
                return (
                  <button key={d} type="button" className={`fr-dia ${d === elegido ? "fr-dia-activo" : ""} ${!dias.includes(d) ? "fr-dia-vacio" : ""}`} onClick={() => { setDia(d); setEditando(null); }}>
                    <span>{DIAS[f.getDay()].slice(0, 3)} {f.getDate()}/{f.getMonth() + 1}</span>
                    <small>{dias.includes(d) ? `${num(h, 0)} h` : "sin datos"}</small>
                  </button>
                );
              })}
            </div>
          </div>
          {puedeRegistrar && <a href="#/horas" className="fr-boton">Pulse aquí para añadir horas</a>}
        </div>

        <div className="card grid gap-2 sm:grid-cols-3">
          <label className="text-sm font-semibold">Finca<select className="input mt-1" value={fincaFiltro} onChange={(e) => setFincaFiltro(e.target.value)}><option value="">Todas</option>{fincasDisponibles.map((f) => <option key={f}>{f}</option>)}</select></label>
          <label className="text-sm font-semibold">Trabajador<select className="input mt-1" value={trabajadorFiltro} onChange={(e) => setTrabajadorFiltro(e.target.value)}><option value="">Todos</option>{trabajadoresDisponibles.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="text-sm font-semibold">Tarea<select className="input mt-1" value={tareaFiltro} onChange={(e) => setTareaFiltro(e.target.value)}><option value="">Todas</option>{tareasDisponibles.map((t) => <option key={t}>{t}</option>)}</select></label>
        </div>

        {aviso && <p role="status" className="card text-green-800">{aviso}</p>}
        {error && <p role="alert" className="rounded bg-white px-3 py-2 text-sm text-red-600">{error}</p>}
        {cargando && !datos && <p className="fr-etiqueta">Cargando…</p>}
        {!dias.length && !cargando && <p className="rounded bg-white/90 px-3 py-2 text-sm">No hay registros en los últimos 7 días ({fecha(desde)} – {fecha(hasta)}).</p>}

        {elegido && !lista.length && !cargando && dias.includes(elegido) && trDia.length === 0 && <p className="rounded bg-white/90 px-3 py-2 text-sm">Sin registros este día.</p>}
        {elegido && !dias.includes(elegido) && !cargando && <p className="rounded bg-white/90 px-3 py-2 text-sm">No hay nada registrado el {fecha(elegido)}.</p>}

        {elegido && listaFiltrada.length > 0 && (
          <>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span>Visible: {num(listaFiltrada.reduce((a, f) => a + f.total, 0), 2)} h · {listaFiltrada.length} trabajador(es)</span>
            {(fincaFiltro || trabajadorFiltro || tareaFiltro) && <button type="button" className="text-green-800 underline" onClick={() => { setFincaFiltro(""); setTrabajadorFiltro(""); setTareaFiltro(""); }}>Limpiar filtros</button>}
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-stone-700">{[...new Map(listaFiltrada.map((f) => [f.finca, f.total])).entries()].map(([f, h]) => <span key={f} className="rounded-full bg-green-100 px-3 py-1">{f}: {num(h, 2)} h</span>)}</div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="fr-tabla w-full">
              <thead>
                <tr>
                  <th className="w-14" />
                  <th className="fr-fecha">{fecha(elegido)}</th>
                  <th>Horas diarias</th>
                  <th>Finca</th>
                  {cols.map((c) => <th key={c.clave}>{c.clave}</th>)}
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((f) => (
                  <Fragment key={f.clave}>
                    <tr>
                      <td className="text-center">
                        {puedeRegistrar
                          ? <button type="button" title="Editar horas de" aria-label={`Editar horas de ${f.nombre}`} className="fr-lapiz" onClick={() => setEditando(f)}><IconoEditar /></button>
                          : <span className="text-stone-300">—</span>}
                      </td>
                      <td className="text-left">{f.nombre}{f.codigo && <span> ({f.codigo})</span>}</td>
                      <td>{num(f.total, 2)}{f.extra > 0 && <small className="!inline ml-1 !text-amber-700">({num(f.extra, 2)} extra)</small>}</td>
                      <td className="text-left">{f.finca}</td>
                      {cols.map((c) => <td key={c.clave}>{celda(f.por.get(c.clave))}</td>)}
                    </tr>
                  </Fragment>
                ))}
                <tr className="fr-total">
                    <td /><td className="text-left">Total visible</td><td>{num(listaFiltrada.reduce((a, f) => a + f.total, 0), 2)}</td><td />
                  {cols.map((c) => <td key={c.clave}>{celda(listaFiltrada.reduce((a, f) => a + (f.por.get(c.clave) ?? 0), 0))}</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Móvil: una tarjeta por trabajador, con solo las subtareas en las que tiene horas */}
          <div className="space-y-3 sm:hidden">
            {listaFiltrada.map((f) => (
              <div key={f.clave} className="card">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold">{f.nombre}{f.codigo && <span className="font-semibold text-stone-500"> ({f.codigo})</span>}</p>
                    <p className="text-sm text-stone-600">{f.finca} · <b className="text-base text-stone-900">{num(f.total, 2)} h</b>{f.extra > 0 && <span className="text-amber-700"> ({num(f.extra, 2)} extra)</span>}</p>
                  </div>
                  {puedeRegistrar && <button type="button" aria-label={`Editar horas de ${f.nombre}`} className="fr-lapiz" onClick={() => setEditando(f)}><IconoEditar /></button>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cols.filter((c) => f.por.get(c.clave)).map((c) => <span key={c.clave} className="fr-chip">{c.clave} <b>{num(f.por.get(c.clave), 2)}</b></span>)}
                </div>

              </div>
            ))}
            <div className="card flex items-center justify-between font-extrabold" style={{ background: "#e8f6e7" }}>
              <span>Total visible</span><span>{num(listaFiltrada.reduce((a, f) => a + f.total, 0), 2)} h</span>
            </div>
          </div>
          </>
        )}
        {elegido && lista.length > 0 && !listaFiltrada.length && <p className="rounded bg-white/90 px-3 py-2 text-sm">No hay registros que coincidan con estos filtros.</p>}

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
