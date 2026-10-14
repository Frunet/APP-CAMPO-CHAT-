import Link from "next/link";
import { cargarContexto } from "@/lib/datos";
import { crearTarea } from "@/lib/actions";
import ActionForm, { Field } from "@/components/ActionForm";
import FincaParcela from "@/components/FincaParcela";
import TareaCheck from "@/components/TareaCheck";
import AsignarTarea from "@/components/AsignarTarea";
import { sumarDias, dowDe, lunesDe, opcionesSemanas } from "@/lib/tiempo";
import { fecha as fmtFecha } from "@/lib/format";

type Tarea = {
  id: string; titulo: string; fecha: string | null; semana_inicio: string | null; completada: boolean; tipo: string;
  fincas?: { nombre: string } | null;
};
type Ev = { fecha: string; texto: string; tipo: "tarea" | "cosecha" | "doc"; id?: string; hecho?: boolean };
type Q = { vista?: string; mes?: string; sem?: string };

const ICONO = { tarea: "📌", cosecha: "🥭", doc: "📄" };
const NOMBRE_MES = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const SEL_TAREA = "id,titulo,fecha,semana_inicio,completada,tipo,fincas(nombre)";
const corto = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;

export default async function Calendario({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const hoy = new Date().toISOString().slice(0, 10);
  const vista = q.vista === "semana" ? "semana" : "mes";
  const mes = /^\d{4}-\d{2}$/.test(q.mes ?? "") ? q.mes! : hoy.slice(0, 7);
  const primero = `${mes}-01`;
  const ultimo = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0)).toISOString().slice(0, 10);
  const sem = /^\d{4}-\d{2}-\d{2}$/.test(q.sem ?? "") ? lunesDe(q.sem!) : lunesDe(hoy);
  const desde = vista === "mes" ? primero : sem;
  const hasta = vista === "mes" ? ultimo : sumarDias(sem, 6);

  const ctx = await cargarContexto();
  const [{ data: fijas }, { data: deSemana }, { data: pendientes }, { data: cult }, { data: docs }, { data: perfiles }] = await Promise.all([
    ctx.db.from("tareas").select(SEL_TAREA).gte("fecha", desde).lte("fecha", hasta).order("fecha"),
    vista === "mes"
      ? ctx.db.from("tareas").select(SEL_TAREA).is("fecha", null).gte("semana_inicio", lunesDe(primero)).lte("semana_inicio", ultimo).order("semana_inicio")
      : ctx.db.from("tareas").select(SEL_TAREA).is("fecha", null).eq("semana_inicio", sem),
    ctx.db.from("tareas").select(SEL_TAREA).is("fecha", null).is("semana_inicio", null).eq("completada", false).order("titulo"),
    ctx.db.from("cultivos_parcela").select("id,cultivo,variedad,fecha_prevista_cosecha,parcelas(codigo,fincas(nombre))").gte("fecha_prevista_cosecha", desde).lte("fecha_prevista_cosecha", hasta),
    ctx.db.from("documentos_esperados").select("id,descripcion,fecha_esperada,fincas(nombre)").is("documento_id", null).gte("fecha_esperada", desde).lte("fecha_esperada", hasta),
    ctx.puedeGestionar ? ctx.db.from("profiles").select("id,nombre").eq("activo", true) : Promise.resolve({ data: [] as any[] }),
  ]);

  const opciones = opcionesSemanas(hoy, 12);
  const opcionesPara = (t: Tarea) => opcionesSemanas(hoy, 12, t.semana_inicio);
  const puede = ctx.puedeRegistrar;
  const listaFijas = (fijas ?? []) as unknown as Tarea[];
  const listaSemana = (deSemana ?? []) as unknown as Tarea[];
  const listaPend = (pendientes ?? []) as unknown as Tarea[];

  const eventos: Ev[] = [
    ...listaFijas.map((t) => ({ fecha: t.fecha!, texto: `${t.titulo}${t.fincas ? ` · ${t.fincas.nombre}` : ""}`, tipo: "tarea" as const, id: t.id, hecho: t.completada })),
    ...(cult ?? []).map((c: any) => ({ fecha: c.fecha_prevista_cosecha, texto: `Cosecha prevista: ${c.cultivo}${c.variedad ? ` ${c.variedad}` : ""} · ${c.parcelas?.fincas?.nombre} ${c.parcelas?.codigo}`, tipo: "cosecha" as const })),
    ...(docs ?? []).map((d: any) => ({ fecha: d.fecha_esperada, texto: `Documento esperado: ${d.descripcion} · ${d.fincas?.nombre}`, tipo: "doc" as const })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const porDia = new Map<string, Ev[]>();
  eventos.forEach((e) => porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e]));

  // Una fila de tarea con casilla y control para moverla (semana, día o pendientes)
  const fila = (t: Tarea, conFecha: boolean, sugerida?: string) => {
    const atrasada = !t.completada && (t.fecha ? t.fecha < hoy : t.semana_inicio ? sumarDias(t.semana_inicio, 6) < hoy : false);
    return (
      <div key={t.id} className="py-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {puede ? <TareaCheck id={t.id} completada={t.completada} /> : <span>📌</span>}
          {conFecha && t.fecha && <span className="w-24 shrink-0 text-stone-500">{fmtFecha(t.fecha)}</span>}
          <span className={`${t.completada ? "line-through opacity-60" : ""} ${atrasada ? "text-red-600" : ""}`}>{t.titulo}</span>
          {t.fincas && <span className="text-xs text-stone-400">· {t.fincas.nombre}</span>}
          {atrasada && <span className="text-xs text-red-600">(sin hacer)</span>}
        </div>
        {puede && (
          <details className="ml-6">
            <summary className="cursor-pointer text-xs text-brand-700">Mover / asignar</summary>
            <AsignarTarea id={t.id} fecha={t.fecha} semana={t.semana_inicio} opciones={opcionesPara(t)} sugerida={sugerida} />
          </details>
        )}
      </div>
    );
  };

  const pestana = (v: string, t: string, href: string) => (
    <Link href={href} className={`rounded-full border px-3 py-1 text-sm ${vista === v ? "border-brand-600 bg-brand-100 text-brand-900" : "border-stone-300 bg-white"}`}>{t}</Link>
  );

  // ----- vista de mes -----
  const ant = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 2, 1)).toISOString().slice(0, 7);
  const sig = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)), 1)).toISOString().slice(0, 7);
  const inicioGrid = sumarDias(primero, -(dowDe(primero) - 1));
  const dias = Array.from({ length: 42 }, (_, i) => sumarDias(inicioGrid, i)).filter((_, i, a) => i < 35 || a[35] <= ultimo);
  const semanasMes = new Map<string, Tarea[]>();
  listaSemana.forEach((t) => semanasMes.set(t.semana_inicio!, [...(semanasMes.get(t.semana_inicio!) ?? []), t]));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Calendario agrícola</h1>

      <div className="flex flex-wrap items-center gap-2">
        {pestana("mes", "Mes", `/calendario?vista=mes&mes=${mes}`)}
        {pestana("semana", "Semana", `/calendario?vista=semana&sem=${sem}`)}
      </div>

      {vista === "mes" ? (
        <>
          <div className="flex items-center justify-between">
            <Link href={`/calendario?vista=mes&mes=${ant}`} className="btn-ghost">←</Link>
            <b className="first-letter:uppercase">{NOMBRE_MES.format(new Date(primero + "T12:00:00Z"))}</b>
            <Link href={`/calendario?vista=mes&mes=${sig}`} className="btn-ghost">→</Link>
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 text-xs">
            {["L", "M", "X", "J", "V", "S", "D"].map((d) => <div key={d} className="bg-stone-100 p-1 text-center font-medium">{d}</div>)}
            {dias.map((d) => {
              const evs = porDia.get(d) ?? [];
              const fuera = !d.startsWith(mes);
              return (
                <Link key={d} href={`/calendario?vista=semana&sem=${lunesDe(d)}`} className={`block min-h-14 bg-white p-1 hover:bg-brand-50 sm:min-h-20 ${fuera ? "opacity-40" : ""} ${d === hoy ? "ring-2 ring-inset ring-brand-500" : ""}`} title="Ver la semana">
                  <div className="text-stone-500">{Number(d.slice(8))}</div>
                  <div className="flex flex-wrap gap-0.5 sm:block">
                    {evs.slice(0, 3).map((e, i) => <div key={i} className={`truncate sm:text-[11px] ${e.hecho ? "line-through opacity-50" : ""}`} title={e.texto}>{ICONO[e.tipo]}<span className="hidden sm:inline"> {e.texto}</span></div>)}
                    {evs.length > 3 && <div className="text-stone-400">+{evs.length - 3}</div>}
                  </div>
                </Link>
              );
            })}
          </div>

          <section className="card">
            <h2 className="mb-2 font-medium">Agenda del mes</h2>
            {eventos.length ? eventos.map((e, i) => {
              const t = e.tipo === "tarea" ? listaFijas.find((x) => x.id === e.id) : null;
              return t ? fila(t, true) : (
                <div key={i} className="flex items-center gap-2 py-0.5 text-sm"><span>{ICONO[e.tipo]}</span><span className="w-24 shrink-0 text-stone-500">{fmtFecha(e.fecha)}</span><span>{e.texto}</span></div>
              );
            }) : <p className="text-sm text-stone-500">Nada con fecha este mes.</p>}
            <p className="mt-2 text-xs text-stone-400">📌 tarea · 🥭 cosecha prevista · 📄 documento esperado. Pulsa un día para ver su semana.</p>
          </section>

          <section className="card">
            <h2 className="mb-2 font-medium">Asignadas a una semana (sin día fijo)</h2>
            {semanasMes.size ? [...semanasMes].map(([s, ts]) => (
              <div key={s} className="mb-2">
                <Link href={`/calendario?vista=semana&sem=${s}`} className="text-sm font-medium text-brand-700">Semana del {corto(s)} al {corto(sumarDias(s, 6))}</Link>
                {ts.map((t) => fila(t, false))}
              </div>
            )) : <p className="text-sm text-stone-500">Ninguna tarea asignada solo a una semana este mes.</p>}
          </section>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <Link href={`/calendario?vista=semana&sem=${sumarDias(sem, -7)}`} className="btn-ghost">←</Link>
            <div className="text-center">
              <b>Semana del {corto(sem)} al {corto(sumarDias(sem, 6))}</b>
              <div className="text-xs text-stone-500">{sem === lunesDe(hoy) ? "Esta semana" : <Link href={`/calendario?vista=semana&sem=${lunesDe(hoy)}`} className="text-brand-700">Ir a esta semana</Link>}</div>
            </div>
            <Link href={`/calendario?vista=semana&sem=${sumarDias(sem, 7)}`} className="btn-ghost">→</Link>
          </div>

          <section className="card border-brand-200 bg-brand-50/40">
            <h2 className="mb-1 font-medium">Esta semana, sin día fijo</h2>
            <p className="mb-1 text-xs text-stone-500">Tareas asignadas a la semana para hacerlas cuando haya hueco. Puedes ponerles un día cuando quieras.</p>
            {listaSemana.length ? listaSemana.map((t) => fila(t, false)) : <p className="text-sm text-stone-500">Ninguna. Trae tareas desde «Pendientes sin fecha» más abajo.</p>}
          </section>

          <div className="grid gap-2 md:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => sumarDias(sem, i)).map((d, i) => {
              const evs = porDia.get(d) ?? [];
              return (
                <div key={d} className={`rounded-xl border bg-white p-2 ${d === hoy ? "border-brand-500 ring-1 ring-brand-500" : "border-stone-200"}`}>
                  <div className="mb-1 text-xs font-medium text-stone-600">{DIAS[i]} <span className="text-stone-400">{corto(d)}</span></div>
                  {evs.length ? evs.map((e, k) => {
                    const t = e.tipo === "tarea" ? listaFijas.find((x) => x.id === e.id) : null;
                    return t ? <div key={k} className="text-xs">{fila(t, false)}</div> : <div key={k} className="py-0.5 text-xs">{ICONO[e.tipo]} {e.texto}</div>;
                  }) : <p className="text-xs text-stone-300">—</p>}
                </div>
              );
            })}
          </div>
        </>
      )}

      <section className="card">
        <h2 className="mb-1 font-medium">Pendientes sin fecha ({listaPend.length})</h2>
        <p className="mb-1 text-xs text-stone-500">Tareas guardadas sin día ni semana. Asígnalas a una semana cuando quieras.</p>
        {listaPend.length ? listaPend.map((t) => fila(t, false, vista === "semana" ? sem : lunesDe(hoy))) : <p className="text-sm text-stone-500">No hay tareas pendientes de asignar.</p>}
      </section>

      {puede && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Nueva tarea o recordatorio</summary>
          <div className="mt-3">
            <ActionForm action={crearTarea} label="Crear tarea" className="grid gap-3 sm:grid-cols-3">
              <Field label="Título *"><input name="titulo" className="input" required /></Field>
              <Field label="Día (opcional)"><input type="date" name="fecha" className="input" /></Field>
              <Field label="O semana (opcional)">
                <select name="semana" className="input" defaultValue="">
                  <option value="">Sin semana</option>
                  {opciones.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </Field>
              <p className="col-span-full -mt-1 text-xs text-stone-500">Déjalos vacíos y la tarea queda <b>pendiente sin fecha</b>; podrás asignarla a una semana o a un día cuando quieras. Si pones día y semana, manda el día.</p>
              <Field label="Tipo"><select name="tipo" className="input"><option value="tarea">Tarea</option><option value="tratamiento">Tratamiento</option><option value="recordatorio">Recordatorio</option></select></Field>
              <FincaParcela fincas={ctx.fincas} />
              <Field label="Asignar a">
                <select name="asignado_a" className="input"><option value="">Yo (creador)</option>{perfiles?.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
              </Field>
              <Field label="Descripción" wide><input name="descripcion" className="input" /></Field>
            </ActionForm>
          </div>
        </details>
      )}
    </div>
  );
}
