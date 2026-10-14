import { cerrarCosteGeneral, crearCosteGeneral, eliminarCosteGeneral } from "@/lib/actions";
import ActionForm, { Field } from "../ActionForm";
import type { cargarContexto } from "@/lib/datos";
import { CATEGORIAS_CG, PERIODICIDADES, COLUMNAS_COSTE, imputacionCampana } from "@/lib/costes-generales";
import { eur, fecha } from "@/lib/format";

type Ctx = Awaited<ReturnType<typeof cargarContexto>>;
const nombreCat = Object.fromEntries(CATEGORIAS_CG), nombrePer = Object.fromEntries(PERIODICIDADES);

export default async function SeccionCostes({ ctx, campana }: { ctx: Ctx; campana?: string }) {
  const { data } = await ctx.db.from("costes_generales").select(COLUMNAS_COSTE).order("desde", { ascending: false });
  const costes = (data ?? []) as any[];
  const hoy = new Date().toISOString().slice(0, 10);
  const campSel = ctx.campanas.find((c) => c.id === campana)?.id ?? ctx.campanas[0]?.id;
  const imp = campSel ? await imputacionCampana(ctx.db, campSel) : null;
  const ok = imp && !("error" in imp) ? imp : null;

  // totales por finca y categoría
  const porFinca = new Map<string, Map<string, number>>();
  ok?.lineas.forEach((l) => {
    const m = porFinca.get(l.finca_id) ?? new Map<string, number>();
    m.set(l.coste.categoria, (m.get(l.coste.categoria) ?? 0) + l.importe);
    porFinca.set(l.finca_id, m);
  });

  return (
    <div className="space-y-4">
      <section className="card space-y-2 text-sm">
        <h2 className="font-medium">Costes generales</h2>
        <p className="text-xs text-stone-500">
          Personal fijo, amortizaciones, gastos financieros, seguros… Un coste <b>sin finca</b> es general de la empresa y se reparte entre todas las fincas activas (por hectáreas o a partes iguales);
          un coste <b>con finca</b> es propio de esa finca. No son gastos de campo: se devengan por días (anual ÷ 365) y se imputan a cada campaña. Solo el administrador los ve.
        </p>
      </section>

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Añadir un coste</summary>
        <div className="mt-3">
          <ActionForm action={crearCosteGeneral} label="Guardar coste" className="grid gap-3 sm:grid-cols-3">
            <Field label="Concepto *"><input name="concepto" className="input" required placeholder="Encargado general" /></Field>
            <Field label="Categoría *"><select name="categoria" className="input" required defaultValue="">
              <option value="" disabled>Elige…</option>{CATEGORIAS_CG.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
            <Field label="Finca"><select name="finca_id" className="input" defaultValue="">
              <option value="">Todas las fincas (general, se reparte)</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>Solo {f.nombre}</option>)}</select></Field>
            <Field label="Reparto (si es general)"><select name="reparto" className="input" defaultValue="hectareas">
              <option value="hectareas">Por hectáreas de cada finca</option><option value="iguales">A partes iguales</option></select></Field>
            <Field label="Importe (€) *"><input name="importe" inputMode="decimal" className="input" placeholder="1500" /></Field>
            <Field label="Periodicidad *"><select name="periodicidad" className="input" defaultValue="mensual">
              {PERIODICIDADES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
            <Field label="Desde *"><input type="date" name="desde" className="input" required /></Field>
            <Field label="Hasta (vacío = sigue vigente)"><input type="date" name="hasta" className="input" /></Field>
            <Field label="Observaciones"><input name="observaciones" className="input" /></Field>
            <p className="col-span-full rounded-lg bg-stone-50 p-2 text-xs text-stone-600">
              <b>Amortización:</b> rellena solo estos dos campos (el importe y la periodicidad se ignoran): cuota anual = valor ÷ años; termina al acabar la vida útil.
            </p>
            <Field label="Valor de adquisición (€)"><input name="valor_adquisicion" inputMode="decimal" className="input" placeholder="30000" /></Field>
            <Field label="Vida útil (años)"><input name="vida_util_anios" inputMode="decimal" className="input" placeholder="10" /></Field>
          </ActionForm>
        </div>
      </details>

      <section className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Concepto", "Categoría", "Finca", "Importe", "Periodicidad", "Vigencia", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {costes.map((c) => {
              const vigente = !c.hasta || c.hasta >= hoy;
              return (
                <tr key={c.id} className={vigente ? "" : "text-stone-400"}>
                  <td className="td">{c.concepto}{c.categoria === "amortizacion" && c.valor_adquisicion != null && <div className="text-xs text-stone-500">valor {eur(Number(c.valor_adquisicion))} · {Number(c.vida_util_anios)} años</div>}</td>
                  <td className="td">{nombreCat[c.categoria]}</td>
                  <td className="td">{c.fincas?.nombre ?? <span title={c.reparto === "iguales" ? "partes iguales" : "por hectáreas"}>Todas ({c.reparto === "iguales" ? "iguales" : "por ha"})</span>}</td>
                  <td className="td">{eur(Number(c.importe))}</td><td className="td">{nombrePer[c.periodicidad]}</td>
                  <td className="td">{fecha(c.desde)} → {c.hasta ? fecha(c.hasta) : "vigente"}</td>
                  <td className="td">
                    <div className="flex gap-2">
                      {(!c.hasta || c.hasta > hoy) && (
                        <ActionForm action={cerrarCosteGeneral} label="Dar de baja" reset={false} className="flex" confirmar="¿Dar de baja este coste a partir de hoy? Lo anterior se conserva.">
                          <input type="hidden" name="id" value={c.id} /><input type="hidden" name="hasta" value={hoy} />
                        </ActionForm>
                      )}
                      <ActionForm action={eliminarCosteGeneral} label="Eliminar" danger reset={false} className="flex" confirmar="¿Eliminar este coste por completo? Desaparecerá de todas las campañas (queda en el historial de auditoría).">
                        <input type="hidden" name="id" value={c.id} />
                      </ActionForm>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!costes.length && <tr><td className="td text-stone-500" colSpan={7}>Aún no hay costes generales.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="font-medium">Imputación por campaña</h2>
          <form method="get" className="flex items-end gap-2">
            <input type="hidden" name="seccion" value="costes" />
            <select name="campana" className="input" defaultValue={campSel ?? ""}>{ctx.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
            <button className="btn-ghost">Ver</button>
          </form>
          {campSel && (<><a className="btn-ghost" href={`/api/exportar/costes-generales?formato=xlsx&campana=${campSel}`}>⬇ Excel</a>
            <a className="btn-ghost" href={`/api/exportar/costes-generales?formato=pdf&campana=${campSel}`}>⬇ PDF</a></>)}
        </div>
        {!ctx.campanas.length && <p className="text-sm text-stone-500">Crea antes una campaña (en Fincas, parcelas y lotes) para ver la imputación.</p>}
        {imp && "error" in imp && <p role="alert" className="text-sm text-red-600">{imp.error}</p>}
        {ok && (
          <>
            <p className="text-xs text-stone-500">
              Campaña «{ok.camp.nombre}»: del {fecha(ok.ini)} al {fecha(ok.fin)}{ok.camp.fecha_fin ? "" : " (campaña abierta: hasta hoy)"}.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="th">Finca</th>{CATEGORIAS_CG.map(([, t]) => <th key={t} className="th text-right">{t}</th>)}<th className="th text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {ok.fincas.map((f) => {
                    const m = porFinca.get(f.id); const tot = [...(m?.values() ?? [])].reduce((a, b) => a + b, 0);
                    return (
                      <tr key={f.id}><td className="td">{f.nombre}</td>
                        {CATEGORIAS_CG.map(([k]) => <td key={k} className="td text-right">{m?.get(k) ? eur(m.get(k)!) : "—"}</td>)}
                        <td className="td text-right font-medium">{eur(tot)}</td></tr>
                    );
                  })}
                  <tr><td className="td font-semibold">Total imputado</td><td className="td" colSpan={CATEGORIAS_CG.length} /><td className="td text-right font-semibold">{eur(ok.total)}</td></tr>
                </tbody>
              </table>
            </div>
            {ok.sinRepartir.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <b>Sin repartir ({eur(ok.sinRepartir.reduce((a, x) => a + x.importe, 0))}):</b>
                <ul className="ml-4 list-disc">{ok.sinRepartir.map((x) => <li key={x.coste.id}>{x.coste.concepto} ({eur(x.importe)}): {x.motivo}</li>)}</ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
