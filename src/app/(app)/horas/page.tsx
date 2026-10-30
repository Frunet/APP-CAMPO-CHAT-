import { cargarContexto } from "@/lib/datos";
import FormHoras from "@/components/FormHoras";
import { Field } from "@/components/ActionForm";
import { TAREAS_HORAS } from "@/lib/horas";
import { eur, fecha, iso, num } from "@/lib/format";

const MOSTRAR = 300;
const uuid = (s?: string) => (s && /^[0-9a-f-]{36}$/i.test(s) ? s : "");
const dia = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");

export default async function Horas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await cargarContexto();
  const f = { desde: dia(sp.desde), hasta: dia(sp.hasta), trabajador: uuid(sp.trabajador), tarea: TAREAS_HORAS.includes(sp.tarea as never) ? sp.tarea! : "" };
  const [{ data: trab }, { data: variedades }] = await Promise.all([
    ctx.db.from("trabajadores").select("id,codigo,nombre,finca_id").eq("activo", true).order("nombre"),
    ctx.db.from("cultivos_maestro").select("id,cultivo,variedad").eq("activo", true).order("cultivo").order("variedad"),
  ]);

  let q = ctx.db.from("partes_trabajo")
    .select("id,fecha,horas_por_trabajador,num_trabajadores,horas_totales,horas_extra_totales,coste_total,tipo_trabajo,actividad,trabajador_nombre,trabajadores(codigo,nombre),fincas(nombre)")
    .order("fecha", { ascending: false }).limit(2000);
  if (f.desde) q = q.gte("fecha", f.desde);
  if (f.hasta) q = q.lte("fecha", f.hasta);
  if (f.trabajador) q = q.eq("trabajador_id", f.trabajador);
  if (f.tarea) q = q.eq("tipo_trabajo", f.tarea);
  const { data, error } = await q;
  // El tractor es del día y la finca (no del personal): se lista aparte y solo con filtro de fechas
  let qt = ctx.db.from("horas_tractor").select("id,fecha,horas,observaciones,fincas(nombre)").order("fecha", { ascending: false }).limit(500);
  if (f.desde) qt = qt.gte("fecha", f.desde);
  if (f.hasta) qt = qt.lte("fecha", f.hasta);
  const { data: tr } = f.trabajador || f.tarea ? { data: [] } : await qt;
  const tractores = (tr ?? []) as any[];
  const horasTractor = tractores.reduce((a, r) => a + Number(r.horas ?? 0), 0);
  const filas = (data ?? []) as any[];
  const horas = filas.reduce((a, r) => a + Number(r.horas_totales ?? 0), 0);
  const coste = filas.reduce((a, r) => a + Number(r.coste_total ?? 0), 0);
  const sinTarifa = filas.filter((r) => r.coste_total == null).length;
  const verCoste = ctx.puedeGestionar;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Horas</h1>

      {ctx.puedeRegistrar ? (
        <section className="card">
          <FormHoras fincas={ctx.fincas.map((x) => ({ id: x.id, nombre: x.nombre }))} trabajadores={(trab ?? []) as any} variedades={(variedades ?? []) as any} hoy={iso(new Date())} />
        </section>
      ) : <p className="text-sm text-stone-500">Tu rol solo permite consultar las horas.</p>}

      <form method="get" className="card grid gap-3 sm:grid-cols-5">
        <Field label="Desde"><input type="date" name="desde" className="input" defaultValue={f.desde} /></Field>
        <Field label="Hasta"><input type="date" name="hasta" className="input" defaultValue={f.hasta} /></Field>
        <Field label="Trabajador"><select name="trabajador" className="input" defaultValue={f.trabajador}><option value="">Todos</option>{(trab ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.codigo ? `${t.codigo} · ` : ""}{t.nombre}</option>)}</select></Field>
        <Field label="Tarea"><select name="tarea" className="input" defaultValue={f.tarea}><option value="">Todas</option>{TAREAS_HORAS.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
        <div className="flex items-end"><button className="btn w-full">Filtrar</button></div>
      </form>

      {error && <p role="alert" className="text-sm text-red-600">No se pudieron cargar las horas: {error.message}</p>}
      <div className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
        <span>{filas.length} registros · <b>{num(horas, 2)} h</b>{verCoste && <> · coste <b>{eur(coste)}</b>{sinTarifa > 0 && <span className="text-amber-600"> (parcial: {sinTarifa} sin tarifa)</span>}</>}</span>
        <span className="ml-auto flex gap-3">
          <a className="text-brand-700 underline" href={`/api/horas/csv?${qs}`}>⬇ CSV</a>
          {ctx.puedeGestionar && <a className="text-brand-700 underline" href={`/api/exportar/trabajo?formato=xlsx${f.desde ? `&desde=${f.desde}` : ""}${f.hasta ? `&hasta=${f.hasta}` : ""}`}>⬇ Excel</a>}
        </span>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Fecha", "Código", "Trabajador", "Finca", "Tarea", "Horas", "Extra", ...(verCoste ? ["Coste"] : [])].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {filas.slice(0, MOSTRAR).map((r) => (
              <tr key={r.id}>
                <td className="td">{fecha(r.fecha)}</td><td className="td">{r.trabajadores?.codigo ?? "—"}</td><td className="td">{r.trabajadores?.nombre ?? r.trabajador_nombre ?? "—"}</td>
                <td className="td">{r.fincas?.nombre}</td><td className="td">{r.tipo_trabajo ?? "—"}{r.actividad && <span className="text-xs text-stone-500"> · {r.actividad}</span>}</td><td className="td">{num(r.horas_totales, 2)}</td><td className="td">{Number(r.horas_extra_totales) > 0 ? num(r.horas_extra_totales, 2) : "—"}</td>
                {verCoste && <td className="td">{r.coste_total == null ? <span className="text-xs text-amber-600">sin tarifa</span> : eur(r.coste_total)}</td>}
              </tr>
            ))}
            {!filas.length && <tr><td className="td text-stone-500" colSpan={8}>Sin registros para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      {tractores.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <p className="px-3 pt-3 text-sm font-medium">🚜 Horas de tractor <span className="font-normal text-stone-500">· {num(horasTractor, 2)} h (por día y finca; no cuentan como horas del personal)</span></p>
          <table className="w-full">
            <thead><tr>{["Fecha", "Finca", "Horas", "Observaciones"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-stone-100">
              {tractores.map((r) => <tr key={r.id}><td className="td">{fecha(r.fecha)}</td><td className="td">{r.fincas?.nombre}</td><td className="td">{num(r.horas, 2)}</td><td className="td">{r.observaciones ?? "—"}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
      {filas.length > MOSTRAR &&<p className="text-xs text-stone-500">Se muestran los {MOSTRAR} más recientes de {filas.length}; el CSV lleva todos.</p>}
    </div>
  );
}
