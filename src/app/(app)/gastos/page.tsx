import Link from "next/link";
import { cargarContexto } from "@/lib/datos";
import { CATEGORIAS, GastoForm, TIPOS_IMPORTE } from "@/components/forms";
import { Field } from "@/components/ActionForm";
import { eur, fecha, num } from "@/lib/format";

type Q = { finca?: string; parcela?: string; campana?: string; categoria?: string; desde?: string; hasta?: string };

export default async function Gastos({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const ctx = await cargarContexto();
  const f = (t: any, conCampana = true) => {
    if (q.finca) t = t.eq("finca_id", q.finca);
    if (q.parcela) t = t.eq("parcela_id", q.parcela);
    if (q.campana && conCampana) t = t.eq("campana_id", q.campana);
    if (q.desde) t = t.gte("fecha", q.desde);
    if (q.hasta) t = t.lte("fecha", q.hasta);
    return t;
  };

  let gq = f(ctx.db.from("gastos").select("id,fecha,proveedor,categoria,concepto,importe,moneda,tipo_importe,documento_id,fincas(nombre),parcelas(codigo)")).order("fecha", { ascending: false }).limit(300);
  if (q.categoria) gq = gq.eq("categoria", q.categoria);
  const [{ data }, kgRes, horasRes, docs] = await Promise.all([
    gq,
    f(ctx.db.from("cosechas").select("kg")).limit(10000),
    f(ctx.db.from("partes_trabajo").select("coste_total"), false).limit(10000),
    ctx.db.from("documentos").select("id,nombre").order("created_at", { ascending: false }).limit(100),
  ]);
  const rows = (data ?? []) as any[];

  const reales = rows.filter((r) => r.tipo_importe === "registrado");
  const monedas = [...new Set(reales.map((r) => r.moneda))];
  const mixta = monedas.length > 1;
  const total = reales.reduce((a, r) => a + Number(r.importe), 0);
  const noReal = rows.filter((r) => r.tipo_importe !== "registrado");
  const porCat = new Map<string, number>();
  reales.forEach((r) => porCat.set(r.categoria, (porCat.get(r.categoria) ?? 0) + Number(r.importe)));

  // Coste/ha: solo si se conoce la superficie de TODO el ámbito consultado
  let ha: number | null = null; let notaHa = "";
  if (q.parcela) {
    const { data: p } = await ctx.db.from("parcelas").select("superficie_ha").eq("id", q.parcela).single();
    ha = p?.superficie_ha ?? null;
  } else {
    const { data: fs } = q.finca
      ? await ctx.db.from("fincas").select("superficie_ha").eq("id", q.finca)
      : await ctx.db.from("fincas").select("superficie_ha").eq("activa", true);
    if (fs?.length && fs.every((x) => x.superficie_ha != null)) ha = fs.reduce((a, x) => a + Number(x.superficie_ha), 0);
  }
  if (!ha) notaHa = "Falta la superficie (ha) de la finca o parcela: no se calcula el coste por hectárea.";
  const kg = ((kgRes.data ?? []) as any[]).reduce((a, r) => a + Number(r.kg), 0);
  const laboral = ((horasRes.data ?? []) as any[]).reduce((a, r) => a + Number(r.coste_total ?? 0), 0);
  const nombreCat = Object.fromEntries(CATEGORIAS);
  const nombreTipo = Object.fromEntries(TIPOS_IMPORTE);

  const parcelas = ctx.fincas.filter((x) => !q.finca || x.id === q.finca).flatMap((x) => x.parcelas.map((p) => ({ id: p.id, t: `${x.nombre} · ${p.codigo}` })));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Gastos y costes</h1>

      {ctx.puedeGestionar && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Registrar gasto</summary>
          <div className="mt-3"><GastoForm ctx={ctx} documentos={docs.data ?? []} /></div>
        </details>
      )}

      <form method="get" className="card grid gap-3 sm:grid-cols-4">
        <Field label="Finca"><select name="finca" className="input" defaultValue={q.finca ?? ""}><option value="">Todas</option>{ctx.fincas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
        <Field label="Parcela"><select name="parcela" className="input" defaultValue={q.parcela ?? ""}><option value="">Todas</option>{parcelas.map((p) => <option key={p.id} value={p.id}>{p.t}</option>)}</select></Field>
        <Field label="Campaña"><select name="campana" className="input" defaultValue={q.campana ?? ""}><option value="">Todas</option>{ctx.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
        <Field label="Categoría"><select name="categoria" className="input" defaultValue={q.categoria ?? ""}><option value="">Todas</option>{CATEGORIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
        <Field label="Desde"><input type="date" name="desde" className="input" defaultValue={q.desde ?? ""} /></Field>
        <Field label="Hasta"><input type="date" name="hasta" className="input" defaultValue={q.hasta ?? ""} /></Field>
        <div className="flex items-end sm:col-span-2"><button className="btn w-full">Filtrar</button></div>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card">
          <div className="text-xs text-stone-500">Gasto registrado (real)</div>
          <div className="text-2xl font-semibold">{mixta ? "—" : `${num(total, 2)} ${monedas[0] ?? "EUR"}`}</div>
          <div className="text-xs text-stone-400">{mixta ? `Monedas mezcladas (${monedas.join(", ")}): sin total único` : `${reales.length} registros`}</div>
        </div>
        <div className="card">
          <div className="text-xs text-stone-500">Coste por hectárea</div>
          <div className="text-2xl font-semibold">{ha && !mixta ? eur(total / ha) : "—"}</div>
          <div className="text-xs text-stone-400">{ha ? `${num(ha, 2)} ha` : notaHa}</div>
        </div>
        <div className="card">
          <div className="text-xs text-stone-500">Coste por kilogramo</div>
          <div className="text-2xl font-semibold">{kg > 0 && !mixta ? `${num(total / kg, 3)} €/kg` : "—"}</div>
          <div className="text-xs text-stone-400">{kg > 0 ? `${num(kg)} kg cosechados en el filtro` : "Sin cosechas registradas en el filtro"}</div>
        </div>
        <div className="card">
          <div className="text-xs text-stone-500">No contabilizado</div>
          <div className="text-2xl font-semibold">{num(noReal.reduce((a, r) => a + Number(r.importe), 0), 2)}</div>
          <div className="text-xs text-stone-400">{noReal.length} presupuestos / estimaciones / previsiones</div>
        </div>
      </div>

      <p className="text-xs text-stone-500">
        Mano de obra según partes de trabajo (los partes no tienen campaña: el filtro de campaña no se aplica a esta cifra): <b>{eur(laboral)}</b> (se muestra aparte; no se suma al gasto registrado para no duplicar si también la has anotado como gasto).
        Los indicadores solo usan importes «registrados». El coste por kg usa solo kg con cosecha registrada; el filtro de categoría no afecta a los kg.
      </p>

      {porCat.size > 0 && (
        <div className="card">
          <div className="mb-1 text-xs text-stone-500">Por categoría (registrado)</div>
          {[...porCat].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="w-48 truncate">{nombreCat[k]}</span>
              <div className="h-2 flex-1 rounded bg-stone-100"><div className="h-2 rounded bg-brand-500" style={{ width: `${total ? (v / total) * 100 : 0}%` }} /></div>
              <span className="w-28 text-right">{num(v, 2)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Fecha", "Finca", "Parcela", "Categoría", "Proveedor / concepto", "Importe", "Naturaleza", "Doc.", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.id} className={r.tipo_importe !== "registrado" ? "bg-amber-50/50" : ""}>
                <td className="td">{fecha(r.fecha)}</td><td className="td">{r.fincas?.nombre}</td><td className="td">{r.parcelas?.codigo ?? "—"}</td>
                <td className="td">{nombreCat[r.categoria]}</td><td className="td">{[r.proveedor, r.concepto].filter(Boolean).join(" · ") || "—"}</td>
                <td className="td font-medium">{num(r.importe, 2)} {r.moneda}</td>
                <td className="td text-xs">{nombreTipo[r.tipo_importe]}</td>
                <td className="td">{r.documento_id ? <Link href={`/documentos/${r.documento_id}`} className="text-brand-700">📎</Link> : <span className="text-xs text-amber-600">sin justificar</span>}</td>
                <td className="td"><Link className="text-brand-700" href={`/gastos/${r.id}`}>Ver / corregir</Link></td>
              </tr>
            ))}
            {!rows.length && <tr><td className="td text-stone-500" colSpan={9}>Sin gastos para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
