import Link from "next/link";
import { notFound } from "next/navigation";
import { cargarContexto } from "@/lib/datos";
import { eliminarRegistro } from "@/lib/actions";
import ActionForm from "@/components/ActionForm";
import Historial from "@/components/Historial";
import { ParteForm } from "@/components/forms";

export default async function EditarParte({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await cargarContexto();
  const { data: parte } = await ctx.db.from("partes_trabajo").select("*").eq("id", id).maybeSingle();
  if (!parte) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/trabajo" className="text-sm text-brand-700">← Partes de trabajo</Link>
      <h1 className="text-xl font-semibold">Parte del {parte.fecha}</h1>
      <p className="text-sm text-stone-500">
        Horas totales: {parte.horas_totales} h · Coste: {parte.coste_total == null ? "sin tarifa (no calculado)" : `${parte.coste_total} €`} · Origen: {parte.origen}
      </p>
      {ctx.puedeRegistrar ? (
        <div className="card"><ParteForm ctx={ctx} parte={parte} /></div>
      ) : <p className="card text-sm">Tu rol es de solo consulta.</p>}
      {ctx.puedeGestionar && (
        <ActionForm action={eliminarRegistro} label="Eliminar parte" danger className="flex" confirmar="¿Eliminar este parte? Quedará constancia en el historial.">
          <input type="hidden" name="tabla" value="partes_trabajo" /><input type="hidden" name="id" value={id} />
        </ActionForm>
      )}
      <section className="card"><h2 className="mb-2 font-medium">Historial de cambios</h2><Historial tabla="partes_trabajo" id={id} /></section>
    </div>
  );
}
