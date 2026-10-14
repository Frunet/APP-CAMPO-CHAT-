import Link from "next/link";
import { notFound } from "next/navigation";
import { cargarContexto } from "@/lib/datos";
import { CATEGORIAS, TIPOS_IMPORTE } from "@/lib/modulos";
import Ficha from "@/components/Ficha";
import Historial from "@/components/Historial";
import { fecha, num } from "@/lib/format";

export default async function DetalleGasto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await cargarContexto();
  const { data } = await ctx.db.from("gastos")
    .select("*, fincas(nombre), parcelas(codigo), lotes(codigo), campanas(nombre)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as any;
  const cat = Object.fromEntries(CATEGORIAS), tipo = Object.fromEntries(TIPOS_IMPORTE);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/gastos" className="text-sm text-brand-700">← Gastos</Link>
      <h1 className="text-xl font-semibold">Gasto del {fecha(r.fecha)}</h1>
      <div className="card">
        <Ficha datos={[
          ["Finca", r.fincas?.nombre], ["Parcela", r.parcelas?.codigo], ["Lote", r.lotes?.codigo], ["Categoría", cat[r.categoria] ?? r.categoria], ["Proveedor", r.proveedor],
          ["Concepto", r.concepto], ["Importe", `${num(r.importe, 2)} ${r.moneda}`], ["Naturaleza del importe", tipo[r.tipo_importe] ?? r.tipo_importe],
          ["Campaña", r.campanas?.nombre],
          ["Documento justificativo", r.documento_id ? <Link key="d" href={`/api/documentos/${r.documento_id}/descargar`} className="text-brand-700">📎 Descargar el documento</Link> : "Sin justificar"],
          ["Observaciones", r.observaciones],
        ]} />
      </div>
      <p className="text-xs text-stone-500">Solo consulta. Para corregir o anular un gasto, díselo al chat o avisa a un administrador.</p>
      <section className="card"><h2 className="mb-2 font-medium">Historial de cambios</h2><Historial tabla="gastos" id={id} /></section>
    </div>
  );
}
