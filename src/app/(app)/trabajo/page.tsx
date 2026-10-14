import Link from "next/link";
import { cargarContexto } from "@/lib/datos";
import { crearEquipo, crearTrabajador } from "@/lib/actions";
import ActionForm, { Field } from "@/components/ActionForm";
import { ParteForm } from "@/components/forms";
import { eur, fecha, num } from "@/lib/format";

export default async function Trabajo({ searchParams }: { searchParams: Promise<{ finca?: string; desde?: string; hasta?: string }> }) {
  const q = await searchParams;
  const ctx = await cargarContexto();
  let qb = ctx.db
    .from("partes_trabajo")
    .select("id,fecha,num_trabajadores,horas_por_trabajador,horas_totales,coste_total,actividad,tipo_trabajo,fincas(nombre),parcelas(codigo)")
    .order("fecha", { ascending: false }).limit(200);
  if (q.finca) qb = qb.eq("finca_id", q.finca);
  if (q.desde) qb = qb.gte("fecha", q.desde);
  if (q.hasta) qb = qb.lte("fecha", q.hasta);
  const { data } = await qb;
  const horas = data?.reduce((a, r) => a + Number(r.horas_totales), 0) ?? 0;
  const costeParcial = data?.some((r) => r.coste_total == null);
  const coste = data?.reduce((a, r) => a + Number(r.coste_total ?? 0), 0) ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Trabajadores y partes de trabajo</h1>

      {ctx.puedeRegistrar && (
        <details className="card" open>
          <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Nuevo parte de trabajo</summary>
          <div className="mt-3"><ParteForm ctx={ctx} /></div>
        </details>
      )}

      {ctx.puedeGestionar && (
        <div className="grid gap-3 md:grid-cols-2">
          <details className="card">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Trabajador (con tarifa)</summary>
            <div className="mt-3">
              <ActionForm action={crearTrabajador} label="Crear trabajador" className="grid gap-3">
                <Field label="Nombre *"><input name="nombre" className="input" required /></Field>
                <Field label="Finca *"><select name="finca_id" className="input" required><option value="">Elige…</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
                <Field label="Coste/hora (€)"><input name="coste_hora" inputMode="decimal" className="input" /></Field>
              </ActionForm>
            </div>
          </details>
          <details className="card">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Equipo / cuadrilla (tarifa por persona)</summary>
            <div className="mt-3">
              <ActionForm action={crearEquipo} label="Crear equipo" className="grid gap-3">
                <Field label="Nombre *"><input name="nombre" className="input" required /></Field>
                <Field label="Finca *"><select name="finca_id" className="input" required><option value="">Elige…</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
                <Field label="Coste/hora por persona (€)"><input name="coste_hora" inputMode="decimal" className="input" /></Field>
              </ActionForm>
            </div>
          </details>
        </div>
      )}

      <form method="get" className="card grid gap-3 sm:grid-cols-4">
        <Field label="Finca"><select name="finca" className="input" defaultValue={q.finca ?? ""}><option value="">Todas</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
        <Field label="Desde"><input type="date" name="desde" className="input" defaultValue={q.desde ?? ""} /></Field>
        <Field label="Hasta"><input type="date" name="hasta" className="input" defaultValue={q.hasta ?? ""} /></Field>
        <div className="flex items-end"><button className="btn w-full">Filtrar</button></div>
      </form>

      <p className="text-sm text-stone-600">
        {data?.length ?? 0} partes · <b>{num(horas, 1)} h</b> · coste <b>{eur(coste)}</b>
        {costeParcial && <span className="text-amber-600"> (parcial: hay partes sin tarifa)</span>}
      </p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Fecha", "Finca", "Parcela", "Personas", "h/persona", "Horas", "Actividad", "Coste", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {data?.map((r: any) => (
              <tr key={r.id}>
                <td className="td">{fecha(r.fecha)}</td><td className="td">{r.fincas?.nombre}</td><td className="td">{r.parcelas?.codigo ?? "—"}</td>
                <td className="td">{r.num_trabajadores}</td><td className="td">{num(r.horas_por_trabajador, 2)}</td><td className="td">{num(r.horas_totales, 2)}</td>
                <td className="td">{r.actividad ?? r.tipo_trabajo ?? "—"}</td>
                <td className="td">{r.coste_total == null ? <span className="text-xs text-amber-600">sin tarifa</span> : eur(r.coste_total)}</td>
                <td className="td"><Link className="text-brand-700" href={`/trabajo/${r.id}`}>Ver / corregir</Link></td>
              </tr>
            ))}
            {!data?.length && <tr><td className="td text-stone-500" colSpan={9}>Sin partes para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
