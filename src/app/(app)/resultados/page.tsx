import Link from "next/link";
import { cargarContexto } from "@/lib/datos";
import {
  NOMBRES, ORIGENES, construirVista, filasCuenta, leerConsulta, pct, valorDe, variacion, type FilaCuenta,
} from "@/lib/resultados";
import ActionForm, { Field } from "@/components/ActionForm";
import { eliminarMovimientoResultado, eliminarVenta, cambiarCategoriaGasto, crearMovimientoResultado, crearVenta } from "@/lib/actions";
import { eur, fecha, num } from "@/lib/format";

const MOSTRAR = 500;
const neg = (v: number) => (v < 0 ? "text-red-600" : "");
const CAT_GASTO = Object.entries(NOMBRES).filter(([k]) => k !== "ventas");

export default async function Resultados({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await cargarContexto();
  const { data: camps } = await ctx.db.from("campanas").select("id,nombre,fecha_inicio,fecha_fin").order("fecha_inicio", { ascending: false });
  const campanas = (camps ?? []) as { id: string; nombre: string; fecha_inicio: string; fecha_fin: string | null }[];
  const c = leerConsulta(await searchParams, ctx.fincas.map((f) => ({ id: f.id, nombre: f.nombre })), campanas);
  const v = await construirVista(ctx.db, c.fincas, c.periodo, c.comparativa);
  const nf = new Map(c.fincas.map((f) => [f.id, f.nombre]));
  const hoy = new Date().toISOString().slice(0, 10);
  const filas = filasCuenta(v.actual), previas = filasCuenta(v.previo);
  const ventas = valorDe(filas, "ventas");
  const href = (extra: Record<string, string>) => { const q = new URLSearchParams(c.qs); for (const [k, x] of Object.entries(extra)) x ? q.set(k, x) : q.delete(k); return `/resultados?${q}`; };
  const exp = (f: string) => `/api/exportar/resultados?formato=${f}&${c.qs}${c.detalle ? "" : ""}`;
  const sinFincas = !ctx.fincas.length;
  const detalle = c.detalle ? v.lineasActual.filter((l) => l.categoria === c.detalle).sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "")) : [];
  const multi = ctx.fincas.length > 1;

  const celda = (f: FilaCuenta) => <td className={`td text-right ${neg(f.valor)} ${f.tipo !== "linea" ? "font-semibold" : ""}`}>{eur(f.valor)}</td>;
  const maxBarra = Math.max(1, ...v.porFinca.flatMap((x) => [valorDe(x.filas, "ventas"), valorDe(x.filas, "total_gasto"), Math.abs(valorDe(x.filas, "resultado"))]));
  const barra = (n: number, color: string) => <div className={`h-3 rounded ${color}`} style={{ width: `${Math.max(1, (Math.abs(n) / maxBarra) * 100)}%` }} />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-xl font-semibold">Cuenta de Resultados</h1>
      <p className="text-xs text-stone-500">Se calcula al momento con las facturas, jornales y registros de la aplicación; ningún total se guarda a mano. Importes sin IVA.</p>

      {sinFincas && <p className="card text-sm text-stone-600">No tienes fincas asignadas. Pide al administrador que te asigne alguna.</p>}

      <form method="get" className="card grid gap-3 sm:grid-cols-4">
        <Field label="Periodo">
          <select name="tipo" className="input" defaultValue={c.tipo}>
            <option value="mes">Mes</option><option value="trimestre">Trimestre</option><option value="anio">Año</option>
            <option value="campana">Campaña</option><option value="rango">Rango de fechas</option>
          </select>
        </Field>
        <Field label="Mes (si «Mes»)"><input type="month" name="mes" className="input" defaultValue={c.periodo.desde.slice(0, 7)} /></Field>
        <Field label="Año (si «Año» o «Trimestre»)"><input name="anio" inputMode="numeric" className="input" defaultValue={c.periodo.desde.slice(0, 4)} /></Field>
        <Field label="Trimestre"><select name="trim" className="input" defaultValue={String(Math.floor((Number(c.periodo.desde.slice(5, 7)) - 1) / 3) + 1)}>
          {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{q}.º</option>)}</select></Field>
        <Field label="Campaña (si «Campaña»)"><select name="campana" className="input" defaultValue={campanas.find((x) => c.periodo.etiqueta.endsWith(x.nombre))?.id ?? ""}>
          <option value="">—</option>{campanas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
        <Field label="Desde (si «Rango»)"><input type="date" name="desde" className="input" defaultValue={c.periodo.desde} /></Field>
        <Field label="Hasta"><input type="date" name="hasta" className="input" defaultValue={c.periodo.hasta} /></Field>
        {multi && (
          <>
            <Field label="Vista"><select name="vista" className="input" defaultValue={c.comparativa ? "comparativa" : "consolidada"}>
              <option value="consolidada">Consolidada (suma de las fincas)</option><option value="comparativa">Comparativa (una columna por finca)</option></select></Field>
            <fieldset className="col-span-full flex flex-wrap items-center gap-3 text-sm">
              <legend className="mb-1 text-xs font-medium text-stone-600">Fincas {ctx.esAdmin ? "" : "(las tuyas)"}</legend>
              {ctx.fincas.map((f) => (
                <label key={f.id} className="flex items-center gap-1"><input type="checkbox" name="finca" value={f.id} defaultChecked={c.fincas.some((x) => x.id === f.id)} /> {f.nombre}</label>
              ))}
              <span className="text-xs text-stone-400">Sin marcar ninguna = todas.</span>
            </fieldset>
          </>
        )}
        <div className="flex items-end sm:col-span-2"><button className="btn w-full">Ver cuenta</button></div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <a className="btn" href={exp("xlsx")}>⬇ Descargar Excel</a>
        <a className="btn-ghost" href={exp("pdf")}>⬇ Descargar PDF</a>
        <span className="text-xs text-stone-500">
          {c.fincas.length === 1 ? c.fincas[0].nombre : `${c.fincas.length} fincas`} · {c.periodo.etiqueta} ({fecha(c.periodo.desde)} – {fecha(c.periodo.hasta)})
        </span>
      </div>

      {/* ----- indicadores ----- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card"><div className="text-xs text-stone-500">Ventas</div><div className="text-xl font-semibold">{eur(ventas)}</div></div>
        <div className="card"><div className="text-xs text-stone-500">Margen bruto</div><div className={`text-xl font-semibold ${neg(valorDe(filas, "margen_bruto"))}`}>{eur(valorDe(filas, "margen_bruto"))}</div>
          <div className="text-xs text-stone-400">{pct(valorDe(filas, "margen_bruto"), ventas) == null ? "sin ventas" : `${num(pct(valorDe(filas, "margen_bruto"), ventas)!, 1)} % s/ventas`}</div></div>
        <div className="card"><div className="text-xs text-stone-500">Resultado</div><div className={`text-xl font-semibold ${neg(valorDe(filas, "resultado"))}`}>{eur(valorDe(filas, "resultado"))}</div>
          <div className="text-xs text-stone-400">{pct(valorDe(filas, "resultado"), ventas) == null ? "sin ventas" : `${num(pct(valorDe(filas, "resultado"), ventas)!, 1)} % s/ventas`}</div></div>
        <div className="card"><div className="text-xs text-stone-500">Año anterior · resultado</div><div className={`text-xl font-semibold ${neg(valorDe(previas, "resultado"))}`}>{eur(valorDe(previas, "resultado"))}</div>
          <div className="text-xs text-stone-400">{variacion(valorDe(filas, "resultado"), valorDe(previas, "resultado")).eur >= 0 ? "+" : ""}{eur(variacion(valorDe(filas, "resultado"), valorDe(previas, "resultado")).eur)}</div></div>
      </div>

      {/* ----- cuenta ----- */}
      {!c.comparativa ? (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead><tr><th className="th">Concepto</th><th className="th text-right">Importe</th><th className="th text-right">Año anterior</th><th className="th text-right">Variación</th><th className="th text-right">%</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {filas.map((f, i) => {
                const x = variacion(f.valor, previas[i].valor);
                const clickable = f.tipo === "linea" || f.k === "ventas";
                return (
                  <tr key={f.k} className={f.tipo === "total" ? "bg-stone-100" : f.tipo === "subtotal" ? "bg-stone-50" : ""}>
                    <td className={`td ${f.tipo !== "linea" ? "font-semibold" : "pl-6"}`}>
                      {clickable ? <Link href={href({ detalle: c.detalle === f.k ? "" : f.k })} className="text-brand-700 hover:underline">{f.nombre}</Link> : f.nombre}
                    </td>
                    {celda(f)}
                    <td className={`td text-right ${neg(previas[i].valor)}`}>{eur(previas[i].valor)}</td>
                    <td className={`td text-right ${neg(x.eur)}`}>{x.eur > 0 ? "+" : ""}{eur(x.eur)}</td>
                    <td className={`td text-right ${neg(x.pct ?? 0)}`}>{x.pct == null ? "—" : `${x.pct > 0 ? "+" : ""}${num(x.pct, 1)} %`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead><tr><th className="th">Concepto</th>{v.porFinca.map((x) => <th key={x.id} className="th text-right">{x.nombre}</th>)}<th className="th text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {filas.map((f, i) => (
                  <tr key={f.k} className={f.tipo === "total" ? "bg-stone-100" : f.tipo === "subtotal" ? "bg-stone-50" : ""}>
                    <td className={`td ${f.tipo !== "linea" ? "font-semibold" : "pl-6"}`}>
                      {f.tipo === "linea" || f.k === "ventas" ? <Link href={href({ detalle: c.detalle === f.k ? "" : f.k })} className="text-brand-700 hover:underline">{f.nombre}</Link> : f.nombre}
                    </td>
                    {v.porFinca.map((x) => <td key={x.id} className={`td text-right ${neg(x.filas[i].valor)} ${f.tipo !== "linea" ? "font-semibold" : ""}`}>{eur(x.filas[i].valor)}</td>)}
                    {celda(f)}
                  </tr>
                ))}
                {(["margen_bruto", "resultado"] as const).map((k) => (
                  <tr key={k}><td className="td text-xs text-stone-500">{k === "margen_bruto" ? "Margen bruto % s/ventas" : "Resultado % s/ventas"}</td>
                    {v.porFinca.map((x) => { const p = pct(valorDe(x.filas, k), valorDe(x.filas, "ventas")); return <td key={x.id} className={`td text-right text-xs ${neg(p ?? 0)}`}>{p == null ? "—" : `${num(p, 1)} %`}</td>; })}
                    {(() => { const p = pct(valorDe(filas, k), ventas); return <td className={`td text-right text-xs ${neg(p ?? 0)}`}>{p == null ? "—" : `${num(p, 1)} %`}</td>; })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card space-y-3">
            <div className="flex flex-wrap gap-3 text-xs text-stone-500">
              <span><span className="mr-1 inline-block h-2 w-3 rounded bg-green-600" />Ventas</span>
              <span><span className="mr-1 inline-block h-2 w-3 rounded bg-amber-500" />Total gasto</span>
              <span><span className="mr-1 inline-block h-2 w-3 rounded bg-brand-600" />Resultado</span>
              <span><span className="mr-1 inline-block h-2 w-3 rounded bg-red-600" />Resultado negativo</span>
            </div>
            {v.porFinca.map((x) => { const r = valorDe(x.filas, "resultado"); return (
              <div key={x.id} className="space-y-1" role="img" aria-label={`${x.nombre}: ventas ${eur(valorDe(x.filas, "ventas"))}, gasto ${eur(valorDe(x.filas, "total_gasto"))}, resultado ${eur(r)}`}>
                <div className="text-sm font-medium">{x.nombre}</div>
                <div className="flex items-center gap-2">{barra(valorDe(x.filas, "ventas"), "bg-green-600")}<span className="whitespace-nowrap text-xs">{eur(valorDe(x.filas, "ventas"))}</span></div>
                <div className="flex items-center gap-2">{barra(valorDe(x.filas, "total_gasto"), "bg-amber-500")}<span className="whitespace-nowrap text-xs">{eur(valorDe(x.filas, "total_gasto"))}</span></div>
                <div className="flex items-center gap-2">{barra(r, r < 0 ? "bg-red-600" : "bg-brand-600")}<span className={`whitespace-nowrap text-xs ${neg(r)}`}>{eur(r)}</span></div>
              </div>); })}
          </div>
        </>
      )}

      {/* ----- detalle ----- */}
      {c.detalle && (
        <div className="card space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium">Detalle: {NOMBRES[c.detalle]}</h2>
            <span className="text-xs text-stone-500">{detalle.length} registro(s) · {eur(detalle.reduce((a, l) => a + l.importe, 0))}</span>
            <Link href={href({ detalle: "" })} className="ml-auto text-xs text-brand-700">Cerrar</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>{["Fecha", ...(multi ? ["Finca"] : []), "Origen", "Descripción", "Importe", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-stone-100">
                {detalle.slice(0, MOSTRAR).map((l, i) => (
                  <tr key={`${l.ref_id}-${i}`}>
                    <td className="td whitespace-nowrap">{l.fecha ? fecha(l.fecha) : "prorrateo"}</td>
                    {multi && <td className="td">{nf.get(l.finca_id)}</td>}
                    <td className="td">{ORIGENES[l.origen] ?? l.origen}</td><td className="td">{l.texto}</td>
                    <td className="td text-right">{eur(l.importe)}</td>
                    <td className="td">
                      {l.origen === "factura_recibida" && l.ref_id && ctx.puedeGestionar && (
                        <ActionForm action={cambiarCategoriaGasto} label="Mover" reset={false} className="flex items-center gap-1">
                          <input type="hidden" name="id" value={l.ref_id} />
                          <select name="categoria" className="input !py-1 text-xs" defaultValue={l.categoria}>{CAT_GASTO.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                        </ActionForm>
                      )}
                      {(l.origen === "venta" || l.origen === "movimiento") && l.ref_id && ctx.puedeGestionar && (
                        <ActionForm action={l.origen === "venta" ? eliminarVenta : eliminarMovimientoResultado} label="Eliminar" danger reset={false} className="flex" confirmar="¿Eliminar este registro? Queda en el historial de auditoría.">
                          <input type="hidden" name="id" value={l.ref_id} />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
                {!detalle.length && <tr><td className="td text-stone-500" colSpan={6}>Sin registros en este periodo.</td></tr>}
              </tbody>
            </table>
          </div>
          {detalle.length > MOSTRAR && <p className="text-xs text-stone-500">Se muestran {MOSTRAR} de {detalle.length}; la descarga incluye todos.</p>}
        </div>
      )}

      <p className="text-xs text-stone-500">
        Origen de los datos: ventas = facturas emitidas; insumos, suministros, consumibles, reparaciones, otros gastos, servicios profesionales, instalaciones y gastos generales = facturas recibidas (cada una se clasifica por la categoría de su proveedor y se puede cambiar a mano en el detalle);
        mano de obra = jornales (partes de trabajo con coste) más registros sin factura; personal fijo y gastos financieros = registros sin factura (nóminas, préstamos) más los <b>costes generales</b> prorrateados a la finca
        (personal fijo → personal fijo, financieros → gastos financieros, amortizaciones → instalaciones, seguros y otros → gastos generales). Solo se cuentan importes «registrados» en euros; los partes sin tarifa no suman.
      </p>

      {/* ----- registrar ----- */}
      {ctx.puedeGestionar ? (
        <div className="grid gap-3 md:grid-cols-2">
          <details className="card">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Registrar una venta (factura emitida)</summary>
            <div className="mt-3">
              <ActionForm action={crearVenta} label="Guardar venta" className="grid gap-3 sm:grid-cols-2">
                <Field label="Finca *"><select name="finca_id" className="input" required defaultValue={c.fincas.length === 1 ? c.fincas[0].id : ""}><option value="">Elige…</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
                <Field label="Fecha *"><input type="date" name="fecha" className="input" required defaultValue={hoy} /></Field>
                <Field label="Cliente"><input name="cliente" className="input" /></Field>
                <Field label="Nº de factura"><input name="numero_factura" className="input" /></Field>
                <Field label="Importe sin IVA (€) *"><input name="importe" inputMode="decimal" className="input" required /></Field>
                <Field label="Campaña"><select name="campana_id" className="input"><option value="">—</option>{campanas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
                <Field label="Observaciones" wide><input name="observaciones" className="input" /></Field>
              </ActionForm>
            </div>
          </details>
          <details className="card">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Registrar un gasto sin factura</summary>
            <div className="mt-3">
              <p className="mb-2 text-xs text-stone-500">Jornales sin parte de trabajo, nóminas, cuotas de préstamo, tributos… Los jornales que ya están en partes de trabajo no hay que volver a anotarlos aquí.</p>
              <ActionForm action={crearMovimientoResultado} label="Guardar registro" className="grid gap-3 sm:grid-cols-2">
                <Field label="Finca *"><select name="finca_id" className="input" required defaultValue={c.fincas.length === 1 ? c.fincas[0].id : ""}><option value="">Elige…</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
                <Field label="Fecha *"><input type="date" name="fecha" className="input" required defaultValue={hoy} /></Field>
                <Field label="Tipo *"><select name="tipo" className="input" required defaultValue=""><option value="" disabled>Elige…</option>
                  <option value="jornal">Jornal → Mano de obra</option><option value="nomina">Nómina → Personal fijo</option><option value="prestamo">Cuota de préstamo → Gastos financieros</option>
                  <option value="tributo">Tributo → Gastos generales</option><option value="otro">Otro (elige el concepto)</option></select></Field>
                <Field label="Concepto de la cuenta (solo si «Otro» o para cambiarlo)"><select name="categoria" className="input" defaultValue=""><option value="">Según el tipo</option>{CAT_GASTO.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
                <Field label="Importe (€) *"><input name="importe" inputMode="decimal" className="input" required /></Field>
                <Field label="Descripción"><input name="concepto" className="input" /></Field>
              </ActionForm>
            </div>
          </details>
        </div>
      ) : (
        <p className="text-xs text-stone-500">Solo responsables y administradores pueden registrar ventas y gastos sin factura.</p>
      )}
    </div>
  );
}
