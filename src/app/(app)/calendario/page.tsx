import Link from "next/link";
import { cargarContexto } from "@/lib/datos";
import { crearTarea } from "@/lib/actions";
import ActionForm, { Field } from "@/components/ActionForm";
import FincaParcela from "@/components/FincaParcela";
import TareaCheck from "@/components/TareaCheck";
import { sumarDias, dowDe } from "@/lib/tiempo";
import { fecha } from "@/lib/format";

type Ev = { fecha: string; texto: string; tipo: "tarea" | "cosecha" | "doc"; id?: string; hecho?: boolean };
const ICONO = { tarea: "📌", cosecha: "🥭", doc: "📄" };
const NOMBRE_MES = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function Calendario({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const q = await searchParams;
  const hoy = new Date().toISOString().slice(0, 10);
  const mes = /^\d{4}-\d{2}$/.test(q.mes ?? "") ? q.mes! : hoy.slice(0, 7);
  const primero = `${mes}-01`;
  const ultimo = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0)).toISOString().slice(0, 10);
  const ant = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 2, 1)).toISOString().slice(0, 7);
  const sig = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)), 1)).toISOString().slice(0, 7);

  const ctx = await cargarContexto();
  const [{ data: tareas }, { data: cult }, { data: docs }, { data: perfiles }] = await Promise.all([
    ctx.db.from("tareas").select("id,titulo,fecha,completada,tipo,fincas(nombre)").gte("fecha", primero).lte("fecha", ultimo),
    ctx.db.from("cultivos_parcela").select("id,cultivo,variedad,fecha_prevista_cosecha,parcelas(codigo,fincas(nombre))").gte("fecha_prevista_cosecha", primero).lte("fecha_prevista_cosecha", ultimo),
    ctx.db.from("documentos_esperados").select("id,descripcion,fecha_esperada,fincas(nombre)").is("documento_id", null).gte("fecha_esperada", primero).lte("fecha_esperada", ultimo),
    ctx.esAdmin || ctx.puedeGestionar ? ctx.db.from("profiles").select("id,nombre").eq("activo", true) : Promise.resolve({ data: [] as any[] }),
  ]);

  const eventos: Ev[] = [
    ...(tareas ?? []).map((t: any) => ({ fecha: t.fecha, texto: `${t.titulo}${t.fincas ? ` · ${t.fincas.nombre}` : ""}`, tipo: "tarea" as const, id: t.id, hecho: t.completada })),
    ...(cult ?? []).map((c: any) => ({ fecha: c.fecha_prevista_cosecha, texto: `Cosecha prevista: ${c.cultivo}${c.variedad ? ` ${c.variedad}` : ""} · ${c.parcelas?.fincas?.nombre} ${c.parcelas?.codigo}`, tipo: "cosecha" as const })),
    ...(docs ?? []).map((d: any) => ({ fecha: d.fecha_esperada, texto: `Documento esperado: ${d.descripcion} · ${d.fincas?.nombre}`, tipo: "doc" as const })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const inicioGrid = sumarDias(primero, -(dowDe(primero) - 1));
  const dias = Array.from({ length: 42 }, (_, i) => sumarDias(inicioGrid, i)).filter((_, i, a) => i < 35 || a[35] <= ultimo);
  const porDia = new Map<string, Ev[]>();
  eventos.forEach((e) => porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e]));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Calendario agrícola</h1>

      <div className="flex items-center justify-between">
        <Link href={`/calendario?mes=${ant}`} className="btn-ghost">←</Link>
        <b className="first-letter:uppercase">{NOMBRE_MES.format(new Date(primero + "T12:00:00Z"))}</b>
        <Link href={`/calendario?mes=${sig}`} className="btn-ghost">→</Link>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 text-xs">
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => <div key={d} className="bg-stone-100 p-1 text-center font-medium">{d}</div>)}
        {dias.map((d) => {
          const evs = porDia.get(d) ?? [];
          const fuera = !d.startsWith(mes);
          return (
            <div key={d} className={`min-h-14 bg-white p-1 sm:min-h-20 ${fuera ? "opacity-40" : ""} ${d === hoy ? "ring-2 ring-inset ring-brand-500" : ""}`}>
              <div className="text-stone-500">{Number(d.slice(8))}</div>
              <div className="flex flex-wrap gap-0.5 sm:block">
                {evs.slice(0, 3).map((e, i) => <div key={i} className={`truncate sm:text-[11px] ${e.hecho ? "line-through opacity-50" : ""}`} title={e.texto}>{ICONO[e.tipo]}<span className="hidden sm:inline"> {e.texto}</span></div>)}
                {evs.length > 3 && <div className="text-stone-400">+{evs.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <section className="card">
        <h2 className="mb-2 font-medium">Agenda del mes</h2>
        {eventos.length ? eventos.map((e, i) => (
          <div key={i} className="flex items-center gap-2 py-0.5 text-sm">
            {e.tipo === "tarea" && ctx.puedeRegistrar ? <TareaCheck id={e.id!} completada={!!e.hecho} /> : <span>{ICONO[e.tipo]}</span>}
            <span className="w-24 shrink-0 text-stone-500">{fecha(e.fecha)}</span>
            <span className={`${e.hecho ? "line-through opacity-60" : ""} ${e.fecha < hoy && !e.hecho && e.tipo === "tarea" ? "text-red-600" : ""}`}>{e.texto}</span>
          </div>
        )) : <p className="text-sm text-stone-500">Nada programado este mes.</p>}
        <p className="mt-2 text-xs text-stone-400">📌 tarea · 🥭 cosecha prevista (fecha indicada en el cultivo de la parcela) · 📄 documento esperado</p>
      </section>

      {ctx.puedeRegistrar && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Nueva tarea o recordatorio</summary>
          <div className="mt-3">
            <ActionForm action={crearTarea} label="Crear tarea" className="grid gap-3 sm:grid-cols-3">
              <Field label="Título *"><input name="titulo" className="input" required /></Field>
              <Field label="Fecha *"><input type="date" name="fecha" className="input" required defaultValue={hoy} /></Field>
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
