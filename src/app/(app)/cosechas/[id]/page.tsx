import Link from "next/link";
import { notFound } from "next/navigation";
import { cargarContexto } from "@/lib/datos";
import Ficha from "@/components/Ficha";
import Historial from "@/components/Historial";
import { fecha, num } from "@/lib/format";

export default async function DetalleCosecha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await cargarContexto();
  const { data } = await ctx.db.from("cosechas")
    .select("*, fincas(nombre), parcelas(codigo), campanas(nombre), equipos(nombre)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as any;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/cosechas" className="text-sm text-brand-700">← Cosechas</Link>
      <h1 className="text-xl font-semibold">Cosecha del {fecha(r.fecha)}</h1>
      <div className="card">
        <Ficha datos={[
          ["Finca", r.fincas?.nombre], ["Parcela", r.parcelas?.codigo], ["Cultivo", r.cultivo], ["Variedad", r.variedad],
          ["Campaña", r.campanas?.nombre], ["Kilogramos", `${num(r.kg, 2)} kg`], ["Cajas", r.cajas], ["Calibre", r.calibre],
          ["Calidad / categoría", r.calidad], ["Destino", r.destino], ["Equipo de recolección", r.equipos?.nombre], ["Origen", r.origen],
          ["Observaciones", r.observaciones],
        ]} />
      </div>
      <p className="text-xs text-stone-500">Solo consulta. Para corregir o anular una cosecha, díselo al chat o avisa a un administrador.</p>
      <section className="card"><h2 className="mb-2 font-medium">Historial de cambios</h2><Historial tabla="cosechas" id={id} /></section>
    </div>
  );
}
