import { useState } from "react";
import { useAuth } from "../auth";
import { Navigate } from "../router";
import { db } from "../supabase";
import { Field, useCarga } from "../ui";
import { eur, iso, num } from "../lib/format";
import { partesPeriodo } from "../lib/leer-operativa";
import { costesPorTarea } from "../lib/operativa";
export default function Costes() {
  const { puedeGestionar, fincas, cargando: authCargando } = useAuth();
  const hoy = iso(new Date());
  const [desde, setDesde] = useState(hoy.slice(0, 7) + "-01"), [hasta, setHasta] = useState(hoy), [finca, setFinca] = useState("");
  const { datos, error, cargando } = useCarga(async () => {
    if (!puedeGestionar) return null;
    if (!desde || !hasta || hasta < desde) throw new Error("Revisa el periodo.");
    const partes = await partesPeriodo(desde, hasta, finca);
    let kg: number | null = null, superficie: number | null = null;
    if (finca) {
      const [f, cosechas] = await Promise.all([db.from("fincas").select("superficie_ha").eq("id", finca).single(), db.from("cosechas").select("kg").eq("finca_id", finca).gte("fecha", desde).lte("fecha", hasta).limit(10001)]);
      if (f.error) throw new Error(f.error.message); if (cosechas.error) throw new Error(cosechas.error.message);
      if ((cosechas.data?.length ?? 0) > 10000) throw new Error("Acorta el periodo para consultar los kilos cosechados.");
      superficie = f.data.superficie_ha == null ? null : Number(f.data.superficie_ha);
      kg = cosechas.data?.length && cosechas.data.every((c) => c.kg != null) ? cosechas.data.reduce((s, c) => s + Number(c.kg), 0) : null;
    }
    return { partes, kg, superficie };
  }, [puedeGestionar, desde, hasta, finca]);
  if (authCargando) return null;
  if (!puedeGestionar) return <Navigate to="/horas" />;
  const grupos = costesPorTarea(datos?.partes ?? []), faltan = grupos.reduce((s, g) => s + g.sinTarifa, 0);
  const coste = grupos.reduce((s, g) => s + g.coste, 0), horas = grupos.reduce((s, g) => s + g.horas, 0);
  const valorados = grupos.reduce((s, g) => s + g.valorados, 0);
  const cosecha = datos?.partes.filter((p) => p.mayor === "Cosecha") ?? [];
  const costeKg = datos?.kg && cosecha.length && cosecha.every((p) => p.coste_total != null) ? cosecha.reduce((s, p) => s + Number(p.coste_total), 0) / datos.kg : null;
  return <div className="mx-auto max-w-5xl space-y-4"><h1 className="text-xl font-semibold">Costes de mano de obra</h1>
    <div className="card grid gap-3 sm:grid-cols-3"><Field label="Desde"><input type="date" className="input" value={desde} onChange={(e) => setDesde(e.target.value)} /></Field><Field label="Hasta"><input type="date" className="input" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Field><Field label="Finca"><select className="input" value={finca} onChange={(e) => setFinca(e.target.value)}><option value="">Todas</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field></div>
    {error && <p role="alert" className="card text-red-700">{error}</p>}{cargando && <p>Cargando costes…</p>}
    {datos && !cargando && <><section className="card space-y-2"><p><b>{num(horas, 1)} h</b> registradas · {!valorados && faltan ? "Coste no disponible" : faltan ? `Coste parcial conocido: ${eur(coste)}` : `Coste: ${eur(coste)}`}</p>{faltan > 0 && <p className="text-sm text-amber-800">{faltan} partes sin coste calculado. Completa las tarifas vigentes en Maestros; no se han estimado sus importes ni recalculado partes anteriores.</p>}<p className="text-sm">Mano de obra por hectárea: {finca && datos.superficie && datos.partes.length && !faltan ? eur(coste / datos.superficie) + "/ha" : "no disponible: elige finca y completa superficie y costes"}</p><p className="text-sm">Mano de obra de cosecha por kilo: {costeKg == null ? "no disponible: faltan horas de cosecha con coste o kilos del periodo" : costeKg.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + " €/kg"}</p><p className="text-xs text-stone-600">Estos importes corresponden solo a la mano de obra registrada, sin insumos, maquinaria ni otros gastos. Se usan los costes históricos de cada parte.</p></section>
    <div className="card overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Tarea</th><th className="th">Horas</th><th className="th">Coste conocido</th><th className="th">Partes sin coste</th></tr></thead><tbody>{grupos.map((g) => <tr key={g.tarea}><td className="td">{g.tarea}</td><td className="td text-right">{num(g.horas, 1)}</td><td className="td text-right">{!g.valorados ? "Sin coste disponible" : g.sinTarifa ? `${eur(g.coste)} (parcial)` : eur(g.coste)}</td><td className="td text-right">{g.sinTarifa}</td></tr>)}</tbody></table>{!grupos.length && <p className="py-3 text-sm">No hay horas en este periodo.</p>}</div></>}
  </div>;
}
