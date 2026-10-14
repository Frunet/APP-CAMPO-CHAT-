import Link from "next/link";
import { cargarContexto } from "@/lib/datos";
import { CATEGORIAS, TIPOS_IMPORTE, aQuery, datosGastos, leerFM } from "@/lib/modulos";
import { Field } from "@/components/ActionForm";
import Descargas from "@/components/Descargas";
import { eur, fecha, num } from "@/lib/format";
import { imputacionCampana } from "@/lib/costes-generales";

const MOSTRAR = 300;

export default async function Gastos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const f = leerFM(await searchParams);
  const ctx = await cargarContexto();
  const d = await datosGastos(ctx.db, f);
  const cg = ctx.esAdmin && f.campana ? await imputacionCampana(ctx.db, f.campana, f.finca) : null; // costes generales: solo administrador
  const nombreCat = Object.fromEntries(CATEGORIAS), nombreTipo = Object.fromEntries(TIPOS_IMPORTE);
  const parcelas = ctx.fincas.filter((x) => !f.finca || x.id === f.finca).flatMap((x) => x.parcelas.map((p) => ({ id: p.id, t: `${x.nombre} · ${p.codigo}` })));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Gastos y costes</h1>

      <Descargas modulo="gastos" qs={aQuery(f)} n={d.n} mostrados={Math.min(d.n, MOSTRAR)}
        registroPor="Los gastos se registran desde el chat («Apunta 300 euros de gasoil en la finca El Mango») o adjuntando la factura en el chat." />

      <form method="get" className="card grid gap-3 sm:grid-cols-4">
        <Field label="Finca"><select name="finca" className="input" defaultValue={f.finca ?? ""}><option value="">Todas</option>{ctx.fincas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
        <Field label="Parcela"><select name="parcela" className="input" defaultValue={f.parcela ?? ""}><option value="">Todas</option>{parcelas.map((p) => <option key={p.id} value={p.id}>{p.t}</option>)}</select></Field>
        <Field label="Campaña"><select name="campana" className="input" defaultValue={f.campana ?? ""}><option value="">Todas</option>{ctx.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
        <Field label="Categoría"><select name="categoria" className="input" defaultValue={f.categoria ?? ""}><option value="">Todas</option>{CATEGORIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
        <Field label="Desde"><input type="date" name="desde" className="input" defaultValue={f.desde ?? ""} /></Field>
        <Field label="Hasta"><input type="date" name="hasta" className="input" defaultValue={f.hasta ?? ""} /></Field>
        <div className="flex items-end sm:col-span-2"><button className="btn w-full">Filtrar</button></div>
      </form>

      {d.error && <p role="alert" className="text-sm text-red-600">No se pudieron cargar los datos: {d.error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card">
          <div className="text-xs text-stone-500">Gasto registrado (real)</div>
          <div className="text-2xl font-semibold">{d.mixta ? "—" : `${num(d.total, 2)} ${d.moneda}`}</div>
          <div className="text-xs text-stone-400">{d.mixta ? `Monedas mezcladas (${d.monedas.join(", ")}): sin total único` : `${d.n - d.noContabilizado.n} registros`}</div>
        </div>
        <div className="card">
          <div className="text-xs text-stone-500">Coste por hectárea</div>
          <div className="text-2xl font-semibold">{d.costeHa != null ? eur(d.costeHa) : "—"}</div>
          <div className="text-xs text-stone-400">{d.ha ? `${num(d.ha, 2)} ha` : "Falta la superficie (ha) de la finca o parcela"}</div>
        </div>
        <div className="card">
          <div className="text-xs text-stone-500">Coste por kilogramo</div>
          <div className="text-2xl font-semibold">{d.costeKg != null ? `${num(d.costeKg, 3)} €/kg` : "—"}</div>
          <div className="text-xs text-stone-400">{d.kg > 0 ? `${num(d.kg)} kg cosechados en el filtro` : "Sin cosechas registradas en el filtro"}</div>
        </div>
        <div className="card">
          <div className="text-xs text-stone-500">No contabilizado</div>
          <div className="text-2xl font-semibold">{num(d.noContabilizado.importe, 2)}</div>
          <div className="text-xs text-stone-400">{d.noContabilizado.n} presupuestos / estimaciones / previsiones</div>
        </div>
      </div>

      {cg && !("error" in cg) && (
        <div className="card text-sm">
          <div className="text-xs text-stone-500">Costes generales imputados a la campaña «{cg.camp.nombre}»{f.finca ? " (esta finca)" : ""} · solo administrador</div>
          <div className="text-2xl font-semibold">{eur(cg.total)}</div>
          <div className="text-xs text-stone-400">
            Aparte del gasto de campo de arriba (personal fijo, amortizaciones, financieros…). Coste total aproximado: {d.mixta ? "—" : eur(d.total + cg.total)}
            {!f.finca && cg.sinRepartir.length > 0 && ` · ${eur(cg.sinRepartir.reduce((a, x) => a + x.importe, 0))} sin repartir (falta la superficie de alguna finca)`}.{" "}
            <Link href={`/maestros?seccion=costes&campana=${f.campana}`} className="text-brand-700">Ver detalle →</Link>
          </div>
        </div>
      )}

      <p className="text-xs text-stone-500">
        Mano de obra según partes de trabajo (los partes no tienen campaña: ese filtro no se aplica a esta cifra): <b>{eur(d.laboral)}</b>. Se muestra aparte para no duplicarla si también se anotó como gasto.
        Los indicadores solo usan importes «registrados». El coste por kg usa solo los kg con cosecha registrada; el filtro de categoría no afecta a los kg.
        {d.truncado && " Se alcanzó el límite de registros: acota las fechas."}
      </p>

      {d.porCategoria.length > 0 && (
        <div className="card">
          <div className="mb-1 text-xs text-stone-500">Por categoría (registrado)</div>
          {d.porCategoria.map((c) => (
            <div key={c.k} className="flex items-center gap-2 text-sm">
              <span className="w-48 truncate">{c.nombre}</span>
              <div className="h-2 flex-1 rounded bg-stone-100"><div className="h-2 rounded bg-brand-500" style={{ width: `${d.total ? (c.v / d.total) * 100 : 0}%` }} /></div>
              <span className="w-28 text-right">{num(c.v, 2)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Fecha", "Finca", "Parcela / lote", "Categoría", "Proveedor / concepto", "Importe", "Naturaleza", "Doc.", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {d.filas.slice(0, MOSTRAR).map((r: any) => (
              <tr key={r.id} className={r.tipo_importe !== "registrado" ? "bg-amber-50/50" : ""}>
                <td className="td">{fecha(r.fecha)}</td><td className="td">{r.fincas?.nombre}</td><td className="td">{r.parcelas?.codigo ?? "—"}{r.lotes?.codigo ? ` / ${r.lotes.codigo}` : ""}</td>
                <td className="td">{nombreCat[r.categoria]}</td><td className="td">{[r.proveedor, r.concepto].filter(Boolean).join(" · ") || "—"}</td>
                <td className="td font-medium">{num(r.importe, 2)} {r.moneda}</td>
                <td className="td text-xs">{nombreTipo[r.tipo_importe]}</td>
                <td className="td">{r.documento_id ? <Link href={`/api/documentos/${r.documento_id}/descargar`} className="text-brand-700" title="Descargar el documento original">📎</Link> : <span className="text-xs text-amber-600">sin justificar</span>}</td>
                <td className="td"><Link className="text-brand-700" href={`/gastos/${r.id}`}>Detalle</Link></td>
              </tr>
            ))}
            {!d.n && <tr><td className="td text-stone-500" colSpan={9}>Sin gastos para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
