import Link from "next/link";
import { cargarContexto } from "@/lib/datos";
import { aQuery, datosTrabajo, leerFM } from "@/lib/modulos";
import { Field } from "@/components/ActionForm";
import Descargas from "@/components/Descargas";
import { eur, fecha, num } from "@/lib/format";

const MOSTRAR = 200;

export default async function Trabajo({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const f = leerFM(await searchParams);
  const ctx = await cargarContexto();
  const d = await datosTrabajo(ctx.db, f);
  const parcelas = ctx.fincas.filter((x) => !f.finca || x.id === f.finca).flatMap((x) => x.parcelas.map((p) => ({ id: p.id, t: `${x.nombre} · ${p.codigo}` })));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Trabajadores y partes de trabajo</h1>

      <Descargas modulo="trabajo" qs={aQuery(f)} n={d.n} mostrados={Math.min(d.n, MOSTRAR)}
        registroPor="Los partes se registran desde el chat («Hoy han trabajado 8 personas durante 7 horas en la parcela 3») o subiendo el parte en Documentos." />

      <form method="get" className="card grid gap-3 sm:grid-cols-5">
        <Field label="Finca"><select name="finca" className="input" defaultValue={f.finca ?? ""}><option value="">Todas</option>{ctx.fincas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
        <Field label="Parcela"><select name="parcela" className="input" defaultValue={f.parcela ?? ""}><option value="">Todas</option>{parcelas.map((p) => <option key={p.id} value={p.id}>{p.t}</option>)}</select></Field>
        <Field label="Desde"><input type="date" name="desde" className="input" defaultValue={f.desde ?? ""} /></Field>
        <Field label="Hasta"><input type="date" name="hasta" className="input" defaultValue={f.hasta ?? ""} /></Field>
        <div className="flex items-end"><button className="btn w-full">Filtrar</button></div>
      </form>

      {d.error && <p role="alert" className="text-sm text-red-600">No se pudieron cargar los datos: {d.error}</p>}
      <p className="text-sm text-stone-600">
        {d.n} partes · <b>{num(d.horas, 1)} h</b> · coste <b>{eur(d.coste)}</b>
        {d.sinTarifa > 0 && <span className="text-amber-600"> (parcial: {d.sinTarifa} parte(s) sin tarifa)</span>}
        {d.truncado && <span className="text-amber-600"> · hay más registros de los que se pueden calcular; acota las fechas</span>}
      </p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Fecha", "Finca", "Parcela", "Equipo / trabajador", "Personas", "h/persona", "Horas", "Actividad", "Coste", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {d.filas.slice(0, MOSTRAR).map((r: any) => (
              <tr key={r.id}>
                <td className="td">{fecha(r.fecha)}</td><td className="td">{r.fincas?.nombre}</td><td className="td">{r.parcelas?.codigo ?? "—"}</td>
                <td className="td">{r.equipos?.nombre ?? r.trabajadores?.nombre ?? "—"}</td>
                <td className="td">{r.num_trabajadores}</td><td className="td">{num(r.horas_por_trabajador, 2)}</td><td className="td">{num(r.horas_totales, 2)}</td>
                <td className="td">{r.actividad ?? r.tipo_trabajo ?? "—"}</td>
                <td className="td">{r.coste_total == null ? <span className="text-xs text-amber-600">sin tarifa</span> : eur(r.coste_total)}</td>
                <td className="td"><Link className="text-brand-700" href={`/trabajo/${r.id}`}>Detalle</Link></td>
              </tr>
            ))}
            {!d.n && <tr><td className="td text-stone-500" colSpan={10}>Sin partes para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
