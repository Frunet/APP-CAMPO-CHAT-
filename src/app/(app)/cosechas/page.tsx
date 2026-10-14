import Link from "next/link";
import { cargarContexto } from "@/lib/datos";
import { aQuery, datosCosechas, leerFM } from "@/lib/modulos";
import { Field } from "@/components/ActionForm";
import Descargas from "@/components/Descargas";
import { fecha, num } from "@/lib/format";

const MOSTRAR = 200;

export default async function Cosechas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const f = leerFM(await searchParams);
  const ctx = await cargarContexto();
  const d = await datosCosechas(ctx.db, f);
  const parcelas = ctx.fincas.filter((x) => !f.finca || x.id === f.finca).flatMap((x) => x.parcelas.map((p) => ({ id: p.id, t: `${x.nombre} · ${p.codigo}` })));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Cosechas y producción</h1>

      <Descargas modulo="cosechas" qs={aQuery(f)} n={d.n} mostrados={Math.min(d.n, MOSTRAR)}
        registroPor="Las cosechas se registran desde el chat («Hemos recolectado 2.450 kg de mango Osteen») o subiendo el albarán o informe en Documentos." />

      <form method="get" className="card grid gap-3 sm:grid-cols-6">
        <Field label="Finca"><select name="finca" className="input" defaultValue={f.finca ?? ""}><option value="">Todas</option>{ctx.fincas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
        <Field label="Parcela"><select name="parcela" className="input" defaultValue={f.parcela ?? ""}><option value="">Todas</option>{parcelas.map((p) => <option key={p.id} value={p.id}>{p.t}</option>)}</select></Field>
        <Field label="Campaña"><select name="campana" className="input" defaultValue={f.campana ?? ""}><option value="">Todas</option>{ctx.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
        <Field label="Desde"><input type="date" name="desde" className="input" defaultValue={f.desde ?? ""} /></Field>
        <Field label="Hasta"><input type="date" name="hasta" className="input" defaultValue={f.hasta ?? ""} /></Field>
        <div className="flex items-end"><button className="btn w-full">Filtrar</button></div>
      </form>

      {d.error && <p role="alert" className="text-sm text-red-600">No se pudieron cargar los datos: {d.error}</p>}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card">
          <div className="text-xs text-stone-500">Total del filtro</div>
          <div className="text-2xl font-semibold">{num(d.kg)} kg</div>
          <div className="text-xs text-stone-400">{d.n} registros{d.truncado ? " · límite alcanzado: acota las fechas" : ""}</div>
        </div>
        <div className="card md:col-span-2">
          <div className="mb-1 text-xs text-stone-500">Por parcela (kg)</div>
          {d.porParcela.map((p) => (
            <div key={p.k} className="flex items-center gap-2 text-sm">
              <span className="w-40 truncate">{p.k}</span>
              <div className="h-2 flex-1 rounded bg-stone-100"><div className="h-2 rounded bg-brand-500" style={{ width: `${d.kg ? (p.v / d.kg) * 100 : 0}%` }} /></div>
              <span className="w-28 text-right">{num(p.v)} ({d.kg ? num((p.v / d.kg) * 100) : 0} %)</span>
            </div>
          ))}
          {!d.porParcela.length && <p className="text-sm text-stone-500">Sin datos.</p>}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Fecha", "Finca", "Parcela", "Cultivo", "Variedad", "Kg", "Cajas", "Calidad", "Destino", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {d.filas.slice(0, MOSTRAR).map((r: any) => (
              <tr key={r.id}>
                <td className="td">{fecha(r.fecha)}</td><td className="td">{r.fincas?.nombre}</td><td className="td">{r.parcelas?.codigo}</td>
                <td className="td">{r.cultivo}</td><td className="td">{r.variedad ?? "—"}</td><td className="td font-medium">{num(r.kg, 2)}</td>
                <td className="td">{r.cajas ?? "—"}</td><td className="td">{r.calidad ?? "—"}</td><td className="td">{r.destino ?? "—"}</td>
                <td className="td"><Link className="text-brand-700" href={`/cosechas/${r.id}`}>Detalle</Link></td>
              </tr>
            ))}
            {!d.n && <tr><td className="td text-stone-500" colSpan={10}>Sin cosechas para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
