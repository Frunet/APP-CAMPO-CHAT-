import Link from "next/link";
import { cargarContexto } from "@/lib/datos";
import { CosechaForm } from "@/components/forms";
import { Field } from "@/components/ActionForm";
import { fecha, num } from "@/lib/format";

export default async function Cosechas({ searchParams }: { searchParams: Promise<{ finca?: string; campana?: string; desde?: string; hasta?: string }> }) {
  const q = await searchParams;
  const ctx = await cargarContexto();
  let qb = ctx.db
    .from("cosechas")
    .select("id,fecha,cultivo,variedad,kg,cajas,calidad,destino,fincas(nombre),parcelas(codigo)")
    .order("fecha", { ascending: false }).limit(200);
  if (q.finca) qb = qb.eq("finca_id", q.finca);
  if (q.campana) qb = qb.eq("campana_id", q.campana);
  if (q.desde) qb = qb.gte("fecha", q.desde);
  if (q.hasta) qb = qb.lte("fecha", q.hasta);
  const { data } = await qb;
  const total = data?.reduce((a, r) => a + Number(r.kg), 0) ?? 0;

  const porParcela = new Map<string, number>();
  data?.forEach((r: any) => porParcela.set(`${r.fincas?.nombre} · ${r.parcelas?.codigo}`, (porParcela.get(`${r.fincas?.nombre} · ${r.parcelas?.codigo}`) ?? 0) + Number(r.kg)));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Cosechas y producción</h1>

      {ctx.puedeRegistrar && (
        <details className="card" open>
          <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Registrar cosecha</summary>
          <div className="mt-3"><CosechaForm ctx={ctx} /></div>
        </details>
      )}

      <form method="get" className="card grid gap-3 sm:grid-cols-5">
        <Field label="Finca"><select name="finca" className="input" defaultValue={q.finca ?? ""}><option value="">Todas</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
        <Field label="Campaña"><select name="campana" className="input" defaultValue={q.campana ?? ""}><option value="">Todas</option>{ctx.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
        <Field label="Desde"><input type="date" name="desde" className="input" defaultValue={q.desde ?? ""} /></Field>
        <Field label="Hasta"><input type="date" name="hasta" className="input" defaultValue={q.hasta ?? ""} /></Field>
        <div className="flex items-end"><button className="btn w-full">Filtrar</button></div>
      </form>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card"><div className="text-xs text-stone-500">Total del filtro</div><div className="text-2xl font-semibold">{num(total)} kg</div><div className="text-xs text-stone-400">{data?.length ?? 0} registros</div></div>
        <div className="card md:col-span-2">
          <div className="mb-1 text-xs text-stone-500">Por parcela (kg)</div>
          {[...porParcela].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="w-40 truncate">{k}</span>
              <div className="h-2 flex-1 rounded bg-stone-100"><div className="h-2 rounded bg-brand-500" style={{ width: `${total ? (v / total) * 100 : 0}%` }} /></div>
              <span className="w-28 text-right">{num(v)} ({total ? num((v / total) * 100) : 0} %)</span>
            </div>
          ))}
          {!porParcela.size && <p className="text-sm text-stone-500">Sin datos.</p>}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Fecha", "Finca", "Parcela", "Cultivo", "Variedad", "Kg", "Cajas", "Calidad", "Destino", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {data?.map((r: any) => (
              <tr key={r.id}>
                <td className="td">{fecha(r.fecha)}</td><td className="td">{r.fincas?.nombre}</td><td className="td">{r.parcelas?.codigo}</td>
                <td className="td">{r.cultivo}</td><td className="td">{r.variedad ?? "—"}</td><td className="td font-medium">{num(r.kg, 2)}</td>
                <td className="td">{r.cajas ?? "—"}</td><td className="td">{r.calidad ?? "—"}</td><td className="td">{r.destino ?? "—"}</td>
                <td className="td"><Link className="text-brand-700" href={`/cosechas/${r.id}`}>Ver / corregir</Link></td>
              </tr>
            ))}
            {!data?.length && <tr><td className="td text-stone-500" colSpan={10}>Sin cosechas para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
