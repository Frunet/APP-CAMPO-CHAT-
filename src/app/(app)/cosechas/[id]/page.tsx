import Link from "next/link";
import { notFound } from "next/navigation";
import { cargarContexto } from "@/lib/datos";
import { eliminarRegistro } from "@/lib/actions";
import ActionForm from "@/components/ActionForm";
import Historial from "@/components/Historial";
import { CosechaForm } from "@/components/forms";

export default async function EditarCosecha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await cargarContexto();
  const { data: cosecha } = await ctx.db.from("cosechas").select("*").eq("id", id).maybeSingle();
  if (!cosecha) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/cosechas" className="text-sm text-brand-700">← Cosechas</Link>
      <h1 className="text-xl font-semibold">Cosecha del {cosecha.fecha}</h1>
      {ctx.puedeRegistrar ? (
        <div className="card"><CosechaForm ctx={ctx} cosecha={cosecha} /></div>
      ) : <p className="card text-sm">Tu rol es de solo consulta.</p>}
      {ctx.puedeGestionar && (
        <ActionForm action={eliminarRegistro} label="Eliminar cosecha" danger className="flex" confirmar="¿Eliminar esta cosecha? Quedará constancia en el historial.">
          <input type="hidden" name="tabla" value="cosechas" /><input type="hidden" name="id" value={id} />
        </ActionForm>
      )}
      <section className="card"><h2 className="mb-2 font-medium">Historial de cambios</h2><Historial tabla="cosechas" id={id} /></section>
    </div>
  );
}
