import { cargarContexto } from "@/lib/datos";
import { construirInforme, leerFiltros } from "@/lib/informes";
import { crearObjetivo, eliminarObjetivo } from "@/lib/actions";
import ActionForm, { Field } from "@/components/ActionForm";
import GraficoBarras from "@/components/GraficoBarras";
import { eur, num } from "@/lib/format";
import { lunesDe } from "@/lib/tiempo";

export default async function Informes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await cargarContexto();
  const f = leerFiltros(sp);
  const inf = await construirInforme(ctx.db, f);
  const k = inf.kpis;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const parcelas = ctx.fincas.filter((x) => !f.finca || x.id === f.finca).flatMap((x) => x.parcelas.map((p) => ({ id: p.id, t: `${x.nombre} · ${p.codigo}` })));

  // Progreso de objetivos en el periodo en curso
  const hoy = new Date().toISOString().slice(0, 10);
  const iniSem = lunesDe(hoy), iniMes = hoy.slice(0, 8) + "01";
  const { data: objs } = await ctx.db.from("objetivos").select("id,finca_id,parcela_id,periodo,kg_objetivo,fincas(nombre),parcelas(codigo)").eq("activo", true);
  const progreso = await Promise.all(((objs ?? []) as any[]).map(async (o) => {
    let q = ctx.db.from("cosechas").select("kg").eq("finca_id", o.finca_id).gte("fecha", o.periodo === "semanal" ? iniSem : iniMes).lte("fecha", hoy);
    if (o.parcela_id) q = q.eq("parcela_id", o.parcela_id);
    const { data } = await q;
    return { ...o, kg: (data ?? []).reduce((a, r) => a + Number(r.kg), 0) };
  }));

  const tarjetas: { t: string; v: string; s?: string }[] = [
    { t: "Producción", v: `${num(k.kgTotal)} kg` },
    { t: "Horas de mano de obra", v: `${num(k.horas, 1)} h` },
    { t: "Coste laboral", v: k.costeLaboral == null ? `≥ ${eur(k.costeLaboralParcial)}` : eur(k.costeLaboral), s: k.costeLaboral == null ? "Parcial: partes sin tarifa" : undefined },
    { t: "Gasto registrado", v: k.gastoTotal == null ? "—" : `${num(k.gastoTotal, 2)} ${k.moneda}` },
    { t: "Coste por hectárea", v: k.costeHa == null ? "—" : `${num(k.costeHa, 2)} ${k.moneda}`, s: k.ha ? `${num(k.ha, 2)} ha` : "Falta superficie" },
    { t: "Coste por kg", v: k.costeKg == null ? "—" : `${num(k.costeKg, 3)} ${k.moneda}/kg` },
    { t: "Kg por trabajador-hora", v: k.kgHora == null ? "—" : num(k.kgHora, 2), s: inf.rend ? `${inf.rend.pares} día(s)-parcela con cosecha y horas` : "Sin días con ambos datos" },
    { t: "No contabilizado", v: num(k.noContabilizado.importe, 2), s: `${k.noContabilizado.n} presupuestos/estimaciones` },
  ];
  const maxP = Math.max(...inf.porParcela.map((x) => x.kg), 1);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Informes</h1>

      <form method="get" className="card grid gap-3 sm:grid-cols-4">
        <Field label="Finca"><select name="finca" className="input" defaultValue={f.finca ?? ""}><option value="">Todas</option>{ctx.fincas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
        <Field label="Parcela"><select name="parcela" className="input" defaultValue={f.parcela ?? ""}><option value="">Todas</option>{parcelas.map((p) => <option key={p.id} value={p.id}>{p.t}</option>)}</select></Field>
        <Field label="Campaña"><select name="campana" className="input" defaultValue={f.campana ?? ""}><option value="">Todas</option>{ctx.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
        <Field label="Cultivo"><input name="cultivo" className="input" defaultValue={f.cultivo ?? ""} /></Field>
        <Field label="Desde"><input type="date" name="desde" className="input" defaultValue={f.desde} /></Field>
        <Field label="Hasta"><input type="date" name="hasta" className="input" defaultValue={f.hasta} /></Field>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button className="btn">Aplicar</button>
          <a className="btn-ghost" href={`/api/informes/excel?${qs}`}>⬇ Excel</a>
          <a className="btn-ghost" href={`/api/informes/pdf?${qs}`}>⬇ PDF</a>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <div key={t.t} className="card"><div className="text-xs text-stone-500">{t.t}</div><div className="text-xl font-semibold">{t.v}</div>{t.s && <div className="text-xs text-stone-400">{t.s}</div>}</div>
        ))}
      </div>

      {inf.notas.length > 0 && (
        <div className="card border-amber-300 bg-amber-50 text-sm"><b>Datos que faltan o limitan los cálculos</b><ul className="mt-1 list-disc pl-5">{inf.notas.map((n) => <li key={n}>{n}</li>)}</ul></div>
      )}

      <section className="card"><h2 className="mb-2 font-medium">Evolución de la producción (kg por día)</h2><GraficoBarras titulo="Producción diaria en kg" datos={inf.porDia.map((d) => ({ x: d.k, y: d.v }))} /></section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 font-medium">Comparativa entre parcelas</h2>
          {inf.porParcela.map((p) => (
            <div key={p.k} className="mb-1 text-sm">
              <div className="flex justify-between"><span>{p.k}</span><span>{num(p.kg)} kg {p.kg_ha != null && <span className="text-xs text-stone-500">· {num(p.kg_ha)} kg/ha</span>}</span></div>
              <div className="h-2 rounded bg-stone-100"><div className="h-2 rounded bg-brand-500" style={{ width: `${(p.kg / maxP) * 100}%` }} /></div>
            </div>
          ))}
          {!inf.porParcela.length && <p className="text-sm text-stone-500">Sin datos.</p>}
        </section>
        <section className="card">
          <h2 className="mb-2 font-medium">Variedades</h2>
          {inf.porVariedad.map((v) => <div key={v.k} className="flex justify-between text-sm"><span>{v.k}</span><span>{num(v.v)} kg</span></div>)}
          {!inf.porVariedad.length && <p className="text-sm text-stone-500">Sin datos.</p>}
          <h2 className="mb-2 mt-4 font-medium">Campañas <span className="text-xs font-normal text-stone-400">(sin filtro de fechas)</span></h2>
          {inf.porCampana.map((v) => <div key={v.k} className="flex justify-between text-sm"><span>{v.k}</span><span>{num(v.v)} kg</span></div>)}
          {!inf.porCampana.length && <p className="text-sm text-stone-500">Sin cosechas asociadas a campañas.</p>}
        </section>
      </div>

      <section className="card">
        <h2 className="mb-2 font-medium">Objetivos de producción (periodo en curso)</h2>
        {progreso.map((o) => (
          <div key={o.id} className="mb-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{o.fincas?.nombre}{o.parcelas ? ` · ${o.parcelas.codigo}` : ""} · {o.periodo}</span>
              <span className="flex items-center gap-2">
                {num(o.kg)} / {num(Number(o.kg_objetivo))} kg ({num((o.kg / Number(o.kg_objetivo)) * 100)} %)
                {ctx.puedeGestionar && (
                  <ActionForm action={eliminarObjetivo} label="✕" danger reset={false} className="inline-flex" confirmar="¿Eliminar este objetivo?">
                    <input type="hidden" name="id" value={o.id} />
                  </ActionForm>
                )}
              </span>
            </div>
            <div className="h-2 rounded bg-stone-100"><div className="h-2 rounded bg-brand-500" style={{ width: `${Math.min(100, (o.kg / Number(o.kg_objetivo)) * 100)}%` }} /></div>
          </div>
        ))}
        {!progreso.length && <p className="text-sm text-stone-500">No hay objetivos definidos. Si los defines, recibirás un aviso cuando no se cumplan.</p>}
        {ctx.puedeGestionar && (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Nuevo objetivo</summary>
            <div className="mt-2">
              <ActionForm action={crearObjetivo} label="Crear objetivo" className="grid gap-3 sm:grid-cols-4">
                <Field label="Finca *"><select name="finca_id" className="input" required><option value="">Elige…</option>{ctx.fincas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
                <Field label="Parcela (opcional)"><select name="parcela_id" className="input"><option value="">Toda la finca</option>{ctx.fincas.flatMap((x) => x.parcelas.map((p) => <option key={p.id} value={p.id}>{x.nombre} · {p.codigo}</option>))}</select></Field>
                <Field label="Periodo"><select name="periodo" className="input"><option value="semanal">Semanal</option><option value="mensual">Mensual</option></select></Field>
                <Field label="Kg objetivo *"><input name="kg_objetivo" inputMode="decimal" className="input" required /></Field>
              </ActionForm>
            </div>
          </details>
        )}
      </section>

      <section className="card text-sm">
        <h2 className="mb-1 font-medium">Registros incompletos</h2>
        <ul className="list-disc pl-5 text-stone-600">
          <li>{inf.incompletos.partesSinTarifa} parte(s) de trabajo sin tarifa</li>
          <li>{inf.incompletos.cosechasSinCampana} cosecha(s) sin campaña</li>
          <li>{inf.incompletos.gastosSinDocumento} gasto(s) registrado(s) sin documento</li>
        </ul>
      </section>
    </div>
  );
}
