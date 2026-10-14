import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { eur, fecha, num, periodos } from "@/lib/format";
import GraficoBarras from "@/components/GraficoBarras";
import { sumarDias } from "@/lib/tiempo";

export default async function Inicio() {
  const db = await createClient();
  const p = periodos();

  const kgEn = async (desde: string, hasta: string) =>
    (await db.from("cosechas").select("kg").gte("fecha", desde).lte("fecha", hasta)).data?.reduce((a, r) => a + Number(r.kg), 0) ?? 0;
  const hace14 = sumarDias(p.hoy, -13);
  const [kgHoy, kgSem, kgMes, partesSem, partesMes, avisos, tareas, pendientes, serie, proximas, partesSinTarifa, cosechasSinCampana, tareasSinFecha] = await Promise.all([
    kgEn(p.hoy, p.hoy), kgEn(p.semana.desde, p.semana.hasta), kgEn(p.mes.desde, p.mes.hasta),
    db.from("partes_trabajo").select("horas_totales,coste_total").gte("fecha", p.semana.desde).lte("fecha", p.semana.hasta),
    db.from("partes_trabajo").select("horas_totales,coste_total").gte("fecha", p.mes.desde).lte("fecha", p.mes.hasta),
    db.from("avisos").select("id,titulo,prioridad").eq("estado", "pendiente").order("created_at", { ascending: false }).limit(5),
    db.from("tareas").select("titulo,fecha,tipo").eq("completada", false).gte("fecha", p.hoy).order("fecha").limit(5),
    db.from("acciones_pendientes").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
    db.from("cosechas").select("fecha,kg").gte("fecha", hace14).lte("fecha", p.hoy),
    db.from("cultivos_parcela").select("cultivo,variedad,fecha_prevista_cosecha,parcelas(codigo,fincas(nombre))").gte("fecha_prevista_cosecha", p.hoy).order("fecha_prevista_cosecha").limit(5),
    db.from("partes_trabajo").select("id", { count: "exact", head: true }).is("coste_total", null).gte("fecha", p.mes.desde),
    db.from("cosechas").select("id", { count: "exact", head: true }).is("campana_id", null).gte("fecha", p.mes.desde),
    db.from("tareas").select("id", { count: "exact", head: true }).eq("completada", false).is("fecha", null),
  ]);
  const porDia = new Map<string, number>();
  (serie.data ?? []).forEach((r) => porDia.set(r.fecha, (porDia.get(r.fecha) ?? 0) + Number(r.kg)));
  const datosSerie = Array.from({ length: 14 }, (_, i) => { const d = sumarDias(hace14, i); return { x: d, y: porDia.get(d) ?? 0 }; });
  const horas = (r: typeof partesSem) => r.data?.reduce((a, x) => a + Number(x.horas_totales), 0) ?? 0;
  const sinTarifa = (r: typeof partesSem) => r.data?.some((x) => x.coste_total == null);
  const coste = (r: typeof partesSem) => r.data?.reduce((a, x) => a + Number(x.coste_total ?? 0), 0) ?? 0;

  const kpis = [
    { t: "Producción hoy", v: `${num(kgHoy)} kg`, s: p.hoy },
    { t: "Producción semana", v: `${num(kgSem)} kg`, s: `${fecha(p.semana.desde)} – ${fecha(p.semana.hasta)}` },
    { t: "Producción mes", v: `${num(kgMes)} kg`, s: `${fecha(p.mes.desde)} – hoy` },
    { t: "Horas semana", v: `${num(horas(partesSem), 1)} h`, s: "Mano de obra registrada" },
    { t: "Horas mes", v: `${num(horas(partesMes), 1)} h`, s: "Mano de obra registrada" },
    { t: "Coste laboral mes", v: eur(coste(partesMes)), s: sinTarifa(partesMes) ? "⚠ Parcial: hay partes sin tarifa" : "Según tarifas configuradas" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Inicio</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.t} className="card">
            <div className="text-xs text-stone-500">{k.t}</div>
            <div className="text-2xl font-semibold">{k.v}</div>
            <div className="text-xs text-stone-400">{k.s}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-stone-500">Cifras calculadas solo a partir de registros guardados. Los indicadores sin datos suficientes se muestran vacíos.</p>

      <section className="card">
        <h2 className="mb-2 font-medium">Producción de los últimos 14 días (kg)</h2>
        <GraficoBarras titulo="Producción diaria, últimos 14 días" datos={datosSerie} />
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 font-medium">Próximas cosechas</h2>
          {proximas.data?.length ? proximas.data.map((c: any, i) => (
            <p key={i} className="text-sm">• {fecha(c.fecha_prevista_cosecha)} · {c.cultivo}{c.variedad ? ` ${c.variedad}` : ""} · {c.parcelas?.fincas?.nombre} {c.parcelas?.codigo}</p>
          )) : <p className="text-sm text-stone-500">Ninguna fecha de cosecha prevista registrada.</p>}
        </section>
        <section className="card">
          <h2 className="mb-2 font-medium">Registros incompletos (este mes)</h2>
          <p className="text-sm">• {partesSinTarifa.count ?? 0} parte(s) sin tarifa</p>
          <p className="text-sm">• {cosechasSinCampana.count ?? 0} cosecha(s) sin campaña</p>
          <Link href="/informes" className="mt-2 inline-block text-sm text-brand-700">Ver informes →</Link>
        </section>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 font-medium">Avisos pendientes</h2>
          {avisos.data?.length ? avisos.data.map((a) => <p key={a.id} className="text-sm">• {a.titulo} <span className="text-xs text-stone-400">({a.prioridad})</span></p>) : <p className="text-sm text-stone-500">Sin avisos.</p>}
          <Link href="/avisos" className="mt-2 inline-block text-sm text-brand-700">Ver todos →</Link>
        </section>
        <section className="card">
          <h2 className="mb-2 font-medium">Próximas tareas</h2>
          {tareas.data?.length ? tareas.data.map((t, i) => <p key={i} className="text-sm">• {fecha(t.fecha)} · {t.titulo}</p>) : <p className="text-sm text-stone-500">Nada programado.</p>}
          {(tareasSinFecha.count ?? 0) > 0 && <Link href="/calendario" className="mt-2 inline-block text-sm text-brand-700">{tareasSinFecha.count} tarea(s) sin día fijo → Calendario</Link>}
        </section>
      </div>
      {(pendientes.count ?? 0) > 0 && (
        <Link href="/chat" className="card block border-amber-300 bg-amber-50 text-sm">
          Tienes {pendientes.count} registro(s) propuesto(s) en el chat sin confirmar →
        </Link>
      )}
    </div>
  );
}
