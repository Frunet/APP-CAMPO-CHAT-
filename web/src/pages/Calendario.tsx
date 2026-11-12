import { useState } from "react";
import { useAuth } from "../auth";
import { db } from "../supabase";
import { Field, msgError, useCarga } from "../ui";
import { fecha, iso } from "../lib/format";

type Tarea = {
  id: string; titulo: string; descripcion: string | null; tipo: string; fecha: string | null; finca_id: string | null; completada: boolean; asignado_a: string | null; created_by: string | null;
  fincas: { nombre: string } | null;
};
type Usuario = { id: string; nombre: string };

const TIPOS: [string, string, string][] = [
  ["tarea", "Tarea", "#118a11"],
  ["tratamiento", "Tratamiento", "#7e3fb8"],
  ["cosecha_prevista", "Cosecha prevista", "#e07b00"],
  ["recordatorio", "Recordatorio", "#1d6fb8"],
];
const color = (tipo: string) => TIPOS.find((t) => t[0] === tipo)?.[2] ?? "#118a11";
const nombreTipo = (tipo: string) => TIPOS.find((t) => t[0] === tipo)?.[1] ?? tipo;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_SEM = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Fecha en AAAA-MM-DD a partir de un día local (sin pasar por UTC). */
const dia = (d: Date) => iso(d);
const sumarDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const textoDia = (s: string) => { const d = new Date(s + "T00:00:00"); return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };

/** Alta y edición de una tarea. */
function TareaForm({ inicial, fechaInicial, usuarios, onGuardado, onCancelar }: { inicial?: Tarea; fechaInicial?: string; usuarios: Usuario[]; onGuardado: () => void; onCancelar: () => void }) {
  const { fincas, esAdmin, perfil } = useAuth();
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [fechaT, setFechaT] = useState(inicial ? inicial.fecha ?? "" : fechaInicial ?? "");
  const [tipo, setTipo] = useState(inicial?.tipo ?? "tarea");
  const [finca, setFinca] = useState(inicial?.finca_id ?? "");
  const [desc, setDesc] = useState(inicial?.descripcion ?? "");
  const [asig, setAsig] = useState(inicial?.asignado_a ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const t = titulo.trim();
    if (t.length < 2) return setError("Escribe qué hay que hacer");
    setOcupado(true); setError(null);
    const datos = { titulo: t.slice(0, 200), descripcion: desc.trim() || null, tipo, fecha: fechaT || null, finca_id: finca || null, asignado_a: asig || (esAdmin ? null : perfil?.id ?? null) }; // quien no es administrador solo crea tareas para sí mismo (así le salen en su calendario)
    const { error } = inicial ? await db.from("tareas").update(datos).eq("id", inicial.id) : await db.from("tareas").insert({ ...datos, origen: "manual" });
    setOcupado(false);
    if (error) return setError(msgError(error));
    onGuardado();
  }

  return (
    <form onSubmit={guardar} className="space-y-2 rounded-xl bg-white p-3" style={{ border: "2px solid #118a11" }}>
      <p className="text-sm font-extrabold uppercase">{inicial ? "Modificar tarea" : "Nueva tarea"}</p>
      <Field label="¿Qué hay que hacer? *"><input className="input" value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Tratamiento de cobre en Rio Velez" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fecha (vacía = sin fecha)"><input type="date" className="input" value={fechaT} onChange={(e) => setFechaT(e.target.value)} /></Field>
        <Field label="Tipo"><select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
        <Field label="Finca (opcional)"><select className="input" value={finca} onChange={(e) => setFinca(e.target.value)}><option value="">Todas / ninguna</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
        {usuarios.length > 0 && <Field label="Asignada a"><select className="input" value={asig} onChange={(e) => setAsig(e.target.value)}><option value="">Nadie en concreto</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Field>}
      </div>
      <Field label="Detalles (opcional)"><textarea className="input" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar"}</button>
        <button type="button" className="btn-ghost" onClick={onCancelar}>Cancelar</button>
        {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}

/** Una tarea en la lista: marcar hecha, modificar o eliminar. */
function FilaTarea({ t, editable, usuarios, alCambiar }: { t: Tarea; editable: boolean; usuarios: Usuario[]; alCambiar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const quien = usuarios.find((u) => u.id === t.asignado_a)?.nombre;

  async function alternar() {
    const { error } = await db.from("tareas").update({ completada: !t.completada }).eq("id", t.id);
    if (error) return setAviso(msgError(error));
    alCambiar();
  }
  async function eliminar() {
    if (!window.confirm(`¿Eliminar la tarea «${t.titulo}»?`)) return;
    const { error } = await db.from("tareas").delete().eq("id", t.id);
    if (error) return setAviso(msgError(error));
    alCambiar();
  }
  if (editando) return <TareaForm inicial={t} usuarios={usuarios} onGuardado={() => { setEditando(false); alCambiar(); }} onCancelar={() => setEditando(false)} />;
  return (
    <li className="flex items-start gap-3 rounded-xl bg-white px-3 py-2.5" style={{ border: `2px solid ${color(t.tipo)}` }}>
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={t.completada} disabled={!editable} onChange={alternar} aria-label={t.completada ? "Marcar como pendiente" : "Marcar como hecha"} />
      <div className="min-w-0 flex-1">
        <p className={`font-bold ${t.completada ? "text-stone-400 line-through" : ""}`}>{t.titulo}</p>
        <p className="text-xs text-stone-600">
          <span className="font-bold" style={{ color: color(t.tipo) }}>{nombreTipo(t.tipo)}</span>
          {t.fincas?.nombre && <> · {t.fincas.nombre}</>}{quien && <> · {quien}</>}{t.fecha && <> · {fecha(t.fecha)}</>}
        </p>
        {t.descripcion && <p className="mt-0.5 whitespace-pre-line text-sm text-stone-700">{t.descripcion}</p>}
        {aviso && <p role="alert" className="text-xs text-red-600">{aviso}</p>}
      </div>
      {editable && (
        <span className="flex shrink-0 gap-2 text-sm">
          <button type="button" className="text-green-800 underline" onClick={() => setEditando(true)}>Editar</button>
          <button type="button" className="text-red-600 underline" onClick={eliminar}>Eliminar</button>
        </span>
      )}
    </li>
  );
}

/** Calendario de tareas por hacer: vista de mes, tareas de cada día y lista de pendientes sin fecha. */
export default function Calendario() {
  const { puedeRegistrar, esAdmin, fincas, perfil } = useAuth();
  const yo = perfil?.id ?? "";
  const verTodos = esAdmin; // solo el administrador (y el usuario «encargado», que lo es) ve el calendario de todos; el resto, solo lo asignado a ellos
  const hoy = dia(new Date());
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [elegido, setElegido] = useState(hoy);
  const [finca, setFinca] = useState("");
  const [modo, setModo] = useState<"mes" | "semana">("mes");
  // Cada usuario ve «su» calendario (lo asignado a él y lo que no tiene dueño en sus fincas). El administrador puede ver el de todos o el de cada usuario.
  const [vista, setVista] = useState<string>(verTodos ? "todos" : "mio");
  const [nueva, setNueva] = useState<string | null>(null); // fecha con la que se abre el alta ("" = sin fecha)

  // Rejilla del mes: de lunes a domingo, 6 semanas
  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const inicio = sumarDias(primero, -((primero.getDay() + 6) % 7));
  const celdas = Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  const desde = dia(celdas[0]), hasta = dia(celdas[41]);

  const { datos, error, cargando, recargar } = useCarga(async () => {
    const sel = "id,titulo,descripcion,tipo,fecha,finca_id,completada,asignado_a,created_by,fincas(nombre)";
    let q = db.from("tareas").select(sel).gte("fecha", desde).lte("fecha", hasta).order("fecha").order("created_at");
    let sinFecha = db.from("tareas").select(sel).is("fecha", null).order("created_at", { ascending: false });
    if (finca) { q = q.eq("finca_id", finca); sinFecha = sinFecha.eq("finca_id", finca); }
    const verTodo = verTodos && vista === "todos";
    if (!verTodo) {
      if (verTodos && vista !== "mio") { q = q.eq("asignado_a", vista); sinFecha = sinFecha.eq("asignado_a", vista); }
      else { q = q.eq("asignado_a", yo); sinFecha = sinFecha.eq("asignado_a", yo); }
    }
    let vencidas = db.from("tareas").select(sel).lt("fecha", hoy).eq("completada", false).order("fecha").order("created_at");
    if (finca) vencidas = vencidas.eq("finca_id", finca);
    if (!verTodo) {
      if (verTodos && vista !== "mio") vencidas = vencidas.eq("asignado_a", vista);
      else vencidas = vencidas.eq("asignado_a", yo);
    }
    const [a, b, c, u] = await Promise.all([q, sinFecha, vencidas, verTodos ? db.from("profiles").select("id,nombre").eq("activo", true).order("nombre") : Promise.resolve({ data: [] as Usuario[], error: null })]);
    if (a.error) throw new Error(a.error.message);
    if (b.error || c.error) throw new Error((b.error ?? c.error)?.message ?? "No se pudieron cargar las tareas");
    return { tareas: (a.data ?? []) as unknown as Tarea[], sinFecha: (b.data ?? []) as unknown as Tarea[], vencidas: (c.data ?? []) as unknown as Tarea[], usuarios: (u.data ?? []) as Usuario[] };
  }, [desde, finca, verTodos, vista, yo]);

  const tareas = datos?.tareas ?? [], sinFecha = datos?.sinFecha ?? [], vencidas = datos?.vencidas ?? [], usuarios = datos?.usuarios ?? [];
  const porDia = new Map<string, Tarea[]>();
  for (const t of tareas) porDia.set(t.fecha!, [...(porDia.get(t.fecha!) ?? []), t]);
  const delDia = porDia.get(elegido) ?? [];
  const semanaInicio = sumarDias(new Date(elegido + "T00:00:00"), -((new Date(elegido + "T00:00:00").getDay() + 6) % 7));
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(semanaInicio, i));
  const pendientesMes = tareas.filter((t) => !t.completada && t.fecha! >= dia(primero) && t.fecha! <= dia(new Date(mes.getFullYear(), mes.getMonth() + 1, 0))).length;
  const cambiarMes = (n: number) => { const d = new Date(mes.getFullYear(), mes.getMonth() + n, 1); setMes(d); setElegido(dia(d)); setNueva(null); };
  const irHoy = () => { const d = new Date(); setMes(new Date(d.getFullYear(), d.getMonth(), 1)); setElegido(hoy); };
  const alGuardar = () => { setNueva(null); recargar(); };
  /** Cada usuario ve solo lo asignado a él (el administrador, todo): lo que se ve se puede modificar si el rol lo permite. */
  const puedeEditar = (_t: Tarea) => puedeRegistrar;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="fr-etiqueta">Calendario de tareas</span>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" className="btn-ghost !px-3" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">‹</button>
            <span className="min-w-[11rem] text-center text-lg font-extrabold capitalize" style={{ color: "#0f6b0f" }}>{MESES[mes.getMonth()]} {mes.getFullYear()}</span>
            <button type="button" className="btn-ghost !px-3" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">›</button>
            <button type="button" className="btn-ghost" onClick={irHoy}>Hoy</button>
            <div className="ml-2 flex rounded-lg border border-stone-300 p-0.5 text-xs font-bold"><button type="button" className={`rounded px-2 py-1 ${modo === "mes" ? "bg-green-100 text-green-900" : ""}`} onClick={() => setModo("mes")}>Mes</button><button type="button" className={`rounded px-2 py-1 ${modo === "semana" ? "bg-green-100 text-green-900" : ""}`} onClick={() => setModo("semana")}>Semana</button></div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {verTodos && (
            <select className="fr-select" value={vista} onChange={(e) => setVista(e.target.value)} aria-label="Calendario de">
              <option value="todos">Calendario de todos</option><option value="mio">Mi calendario</option>
              {usuarios.filter((u) => u.id !== yo).map((u) => <option key={u.id} value={u.id}>Calendario de {u.nombre}</option>)}
            </select>
          )}
          <select className="fr-select" value={finca} onChange={(e) => setFinca(e.target.value)} aria-label="Filtrar por finca"><option value="">Todas las fincas</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select>
          {puedeRegistrar && <button type="button" className="fr-boton" onClick={() => setNueva(elegido)}>＋ Añadir tarea</button>}
        </div>
      </div>

      {error && <p role="alert" className="rounded bg-white px-3 py-2 text-sm text-red-600">{error}</p>}
      <p className="text-sm font-semibold">{cargando && !datos ? "Cargando…" : `${pendientesMes} tarea(s) pendiente(s) este mes`}</p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Mes */}
        <div className="card p-2 sm:p-3">
          {modo === "semana" && <div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-extrabold">Semana del {fecha(dia(semana[0]))}</h2><span className="text-xs text-stone-500">Pulsa un día para ver sus tareas</span></div>}
          <div className="grid grid-cols-7 gap-px text-center text-xs font-extrabold uppercase text-stone-600">{DIAS_SEM.map((d) => <div key={d} className="py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {(modo === "semana" ? semana : celdas).map((d) => {
              const s = dia(d), lista = porDia.get(s) ?? [], fuera = d.getMonth() !== mes.getMonth();
              const pend = lista.filter((t) => !t.completada).length;
              return (
                <button key={s} type="button" onClick={() => { setElegido(s); setNueva(null); }}
                  className={`min-h-[3.2rem] rounded-lg p-1 text-left align-top ${modo === "semana" ? "min-h-[7rem]" : "sm:min-h-[5.2rem]"} ${fuera ? "opacity-45" : ""}`}
                  style={{ border: s === elegido ? "2px solid #118a11" : "1px solid #c9d8c9", background: s === elegido ? "#e8f6e7" : s === hoy ? "#fff6e0" : "#fff" }}>
                  <span className={`text-xs font-extrabold ${s === hoy ? "rounded-full bg-orange-500 px-1.5 py-0.5 text-white" : ""}`}>{d.getDate()}</span>
                  {/* Móvil: puntos por tarea; escritorio: títulos */}
                  <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden">{lista.slice(0, 6).map((t) => <i key={t.id} className="inline-block h-2 w-2 rounded-full" style={{ background: t.completada ? "#b5b5b5" : color(t.tipo) }} />)}</span>
                  <span className="mt-1 hidden space-y-0.5 sm:block">
                    {lista.slice(0, 3).map((t) => <span key={t.id} className={`block truncate rounded px-1 text-[11px] font-semibold text-white ${t.completada ? "line-through opacity-60" : ""}`} style={{ background: color(t.tipo) }}>{t.titulo}</span>)}
                    {lista.length > 3 && <span className="block text-[11px] font-bold text-stone-600">+{lista.length - 3} más</span>}
                  </span>
                  {pend === 0 && lista.length > 0 && <span className="sr-only">todas hechas</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-stone-600">{TIPOS.map(([v, t, c]) => <span key={v}><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: c }} />{t}</span>)}</p>
        </div>

        {/* Día elegido y pendientes sin fecha */}
        <div className="space-y-3">
          <div className="card space-y-2">
            <h2 className="text-base font-extrabold capitalize">{textoDia(elegido)}{elegido === hoy && <span className="ml-2 text-xs font-bold normal-case text-orange-600">hoy</span>}</h2>
            {nueva !== null && <TareaForm fechaInicial={nueva} usuarios={usuarios} onGuardado={alGuardar} onCancelar={() => setNueva(null)} />}
            <ul className="space-y-2">
              {delDia.map((t) => <FilaTarea key={t.id} t={t} editable={puedeEditar(t)} usuarios={usuarios} alCambiar={recargar} />)}
              {!delDia.length && nueva === null && <li className="text-sm text-stone-500">No hay tareas este día.{puedeRegistrar && <> <button type="button" className="font-bold text-green-800 underline" onClick={() => setNueva(elegido)}>Añadir una</button></>}</li>}
            </ul>
          </div>

          <div className="card space-y-2 border-2 border-amber-300 bg-amber-50">
            <h2 className="text-base font-extrabold">Vencidas</h2>
            <p className="text-xs text-stone-600">Tareas con fecha anterior a hoy y todavía pendientes.</p>
            <ul className="space-y-2">{vencidas.map((t) => <FilaTarea key={t.id} t={t} editable={puedeEditar(t)} usuarios={usuarios} alCambiar={recargar} />)}{!vencidas.length && <li className="text-sm text-stone-500">No hay tareas vencidas.</li>}</ul>
          </div>

          <div className="card space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-extrabold">Pendientes sin fecha</h2>
              {puedeRegistrar && <button type="button" className="text-sm font-bold text-green-800 underline" onClick={() => setNueva("")}>＋ Añadir</button>}
            </div>
            <ul className="space-y-2">
              {sinFecha.map((t) => <FilaTarea key={t.id} t={t} editable={puedeEditar(t)} usuarios={usuarios} alCambiar={recargar} />)}
              {!sinFecha.length && <li className="text-sm text-stone-500">Nada pendiente sin fecha.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
