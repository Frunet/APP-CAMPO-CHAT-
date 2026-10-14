import Link from "next/link";
import { notFound } from "next/navigation";
import { cargarContexto } from "@/lib/datos";
import Ficha from "@/components/Ficha";
import Historial from "@/components/Historial";
import { eur, fecha, num } from "@/lib/format";

export default async function DetalleParte({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await cargarContexto();
  const { data: p } = await ctx.db.from("partes_trabajo")
    .select("*, fincas(nombre), parcelas(codigo), equipos(nombre), trabajadores(nombre)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const r = p as any;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/trabajo" className="text-sm text-brand-700">← Partes de trabajo</Link>
      <h1 className="text-xl font-semibold">Parte del {fecha(r.fecha)}</h1>
      <div className="card">
        <Ficha datos={[
          ["Finca", r.fincas?.nombre], ["Parcela", r.parcelas?.codigo], ["Equipo / trabajador", r.equipos?.nombre ?? r.trabajadores?.nombre],
          ["Personas", r.num_trabajadores], ["Horas por persona", num(r.horas_por_trabajador, 2)], ["Horas totales", num(r.horas_totales, 2)],
          ["Entrada / salida", r.hora_entrada || r.hora_salida ? `${r.hora_entrada?.slice(0, 5) ?? "—"} – ${r.hora_salida?.slice(0, 5) ?? "—"}` : ""],
          ["Tipo de trabajo", r.tipo_trabajo], ["Actividad", r.actividad],
          ["Coste por hora", r.coste_hora == null ? "sin tarifa" : eur(r.coste_hora)], ["Coste total", r.coste_total == null ? "sin tarifa (no calculado)" : eur(r.coste_total)],
          ["Origen", r.origen], ["Observaciones", r.observaciones],
        ]} />
      </div>
      <p className="text-xs text-stone-500">Solo consulta. Para corregir o anular un parte, díselo al chat o avisa a un administrador.</p>
      <section className="card"><h2 className="mb-2 font-medium">Historial de cambios</h2><Historial tabla="partes_trabajo" id={id} /></section>
    </div>
  );
}
