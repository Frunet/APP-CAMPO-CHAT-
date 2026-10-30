import { db } from "../supabase";
import { iso, lunes, num } from "../lib/format";
import { useCarga } from "../ui";

async function sumar(tabla: "cosechas" | "partes_trabajo", col: string, desde: string, hasta: string) {
  let total = 0;
  for (let a = 0; a < 100000; a += 1000) {
    const { data, error } = await db.from(tabla).select(col).gte("fecha", desde).lte("fecha", hasta).range(a, a + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as unknown as Record<string, number>[]) total += Number(r[col] ?? 0);
    if ((data ?? []).length < 1000) break;
  }
  return total;
}

export default function Inicio() {
  const { datos, error, cargando } = useCarga(async () => {
    const hoy = new Date(), l = lunes(hoy);
    const semana = { desde: iso(l), hasta: iso(new Date(l.getTime() + 6 * 864e5)) };
    const mes = { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) };
    const [kgHoy, kgSemana, kgMes, hSemana] = await Promise.all([
      sumar("cosechas", "kg", iso(hoy), iso(hoy)), sumar("cosechas", "kg", semana.desde, semana.hasta), sumar("cosechas", "kg", mes.desde, mes.hasta),
      sumar("partes_trabajo", "horas_totales", semana.desde, semana.hasta),
    ]);
    return { kgHoy, kgSemana, kgMes, hSemana, semana };
  }, []);

  const tarjetas = datos ? [
    ["Producción hoy", `${num(datos.kgHoy)} kg`], ["Producción semana", `${num(datos.kgSemana)} kg`], ["Producción mes", `${num(datos.kgMes)} kg`], ["Horas semana", `${num(datos.hSemana, 1)} h`],
  ] : [];
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Inicio</h1>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {cargando && <p className="text-sm text-stone-500">Cargando…</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tarjetas.map(([t, v]) => <div key={t} className="card"><p className="text-xs text-stone-500">{t}</p><p className="mt-1 text-xl font-semibold">{v}</p></div>)}
      </div>
    </div>
  );
}
