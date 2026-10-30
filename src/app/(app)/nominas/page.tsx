import { redirect } from "next/navigation";
import { cargarContexto } from "@/lib/datos";
import { Field } from "@/components/ActionForm";
import { leerPeriodo } from "@/lib/resultados";
import { datosNominas } from "@/lib/nominas";
import { fecha, num } from "@/lib/format";

export default async function Nominas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await cargarContexto();
  if (!ctx.puedeGestionar) redirect("/"); // las horas por trabajador las ven responsables y administradores
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const { data: camps } = await ctx.db.from("campanas").select("id,nombre,fecha_inicio,fecha_fin").order("fecha_inicio", { ascending: false });
  const hoy = new Date().toISOString().slice(0, 10);
  const { tipo, p } = leerPeriodo({ tipo: "mes", ...sp }, (camps ?? []) as any[], hoy);
  const todos = await datosNominas(ctx.db, ctx.fincas.map((f) => f.id), p.desde, p.hasta);
  const trabajador = todos.some((g) => g.clave === sp.trabajador) ? sp.trabajador! : "";
  const res = trabajador ? todos.filter((g) => g.clave === trabajador) : todos;
  const total = { horas: res.reduce((a, g) => a + g.horas, 0), normales: res.reduce((a, g) => a + g.normales, 0), extra: res.reduce((a, g) => a + g.extra, 0), festivo: res.reduce((a, g) => a + g.festivo, 0) };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Nóminas</h1>
      <p className="text-xs text-stone-500">Consulta de las horas de cada trabajador por periodo, a partir de los partes de horas registrados. Las horas de tractor no se incluyen: no son del personal.</p>

      <form method="get" className="card grid gap-3 sm:grid-cols-4">
        <Field label="Periodo"><select name="tipo" className="input" defaultValue={tipo}><option value="mes">Mes</option><option value="trimestre">Trimestre</option><option value="anio">Año</option><option value="campana">Campaña</option><option value="rango">Rango de fechas</option></select></Field>
        <Field label="Mes (si «Mes»)"><input type="month" name="mes" className="input" defaultValue={p.desde.slice(0, 7)} /></Field>
        <Field label="Año / trimestre"><div className="flex gap-2"><input name="anio" inputMode="numeric" className="input" defaultValue={p.desde.slice(0, 4)} /><select name="trim" className="input" defaultValue={String(Math.floor((Number(p.desde.slice(5, 7)) - 1) / 3) + 1)}>{[1, 2, 3, 4].map((q) => <option key={q} value={q}>{q}.º</option>)}</select></div></Field>
        <Field label="Trabajador"><select name="trabajador" className="input" defaultValue={trabajador}><option value="">Todos</option>{todos.map((g) => <option key={g.clave} value={g.clave}>{g.trabajador}</option>)}</select></Field>
        <Field label="Campaña (si «Campaña»)"><select name="campana" className="input" defaultValue=""><option value="">—</option>{(camps ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
        <Field label="Desde (si «Rango»)"><input type="date" name="desde" className="input" defaultValue={p.desde} /></Field>
        <Field label="Hasta"><input type="date" name="hasta" className="input" defaultValue={p.hasta} /></Field>
        <div className="flex items-end"><button className="btn w-full">Ver</button></div>
      </form>

      <p className="text-sm text-stone-600">
        {p.etiqueta} ({fecha(p.desde)} – {fecha(p.hasta)}) · {res.length} trabajador(es) · <b>{num(total.horas, 1)} h</b>
        {total.extra > 0 && <> (de ellas {num(total.extra, 1)} extra)</>}{total.festivo > 0 && <> · {num(total.festivo, 1)} en festivo</>}
      </p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Trabajador", "Días", "Normales", "Extra", "Festivo", "Total h"].map((h, i) => <th key={h} className={`th ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {res.map((g) => (
              <tr key={g.clave}>
                <td className="td" colSpan={6}>
                  <details>
                    <summary className="grid cursor-pointer grid-cols-[1fr_repeat(5,5rem)] items-center gap-x-2 text-sm">
                      <span className="font-medium">{g.trabajador}</span>
                      <span className="text-right">{g.dias}</span><span className="text-right">{num(g.normales, 1)}</span><span className="text-right">{num(g.extra, 1)}</span>
                      <span className="text-right">{num(g.festivo, 1)}</span><span className="text-right font-medium">{num(g.horas, 1)}</span>
                    </summary>
                    <table className="mt-2 w-full text-xs"><thead><tr>{["Fecha", "Finca", "Tarea", "Horas", "Extra"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                      <tbody>{g.lineas.map((l, i) => <tr key={i}><td className="td">{fecha(l.fecha)}{l.festivo ? " (festivo)" : ""}</td><td className="td">{l.finca}</td><td className="td">{l.actividad}</td><td className="td">{num(l.horas, 1)}</td><td className="td">{l.extra ? num(l.extra, 1) : ""}</td></tr>)}</tbody></table>
                  </details>
                </td>
              </tr>
            ))}
            {!res.length && <tr><td className="td text-stone-500" colSpan={6}>No hay horas en este periodo.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
