import Link from "next/link";
import { notFound } from "next/navigation";
import { cargarContexto } from "@/lib/datos";
import { eliminarRegistro } from "@/lib/actions";
import ActionForm from "@/components/ActionForm";
import Historial from "@/components/Historial";
import { GastoForm } from "@/components/forms";

export default async function EditarGasto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await cargarContexto();
  const [{ data: gasto }, { data: docs }] = await Promise.all([
    ctx.db.from("gastos").select("*").eq("id", id).maybeSingle(),
    ctx.db.from("documentos").select("id,nombre").order("created_at", { ascending: false }).limit(100),
  ]);
  if (!gasto) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/gastos" className="text-sm text-brand-700">← Gastos</Link>
      <h1 className="text-xl font-semibold">Gasto del {gasto.fecha}</h1>
      {gasto.documento_id && <Link href={`/documentos/${gasto.documento_id}`} className="text-sm text-brand-700">📎 Ver documento justificativo</Link>}
      {ctx.puedeGestionar ? (
        <div className="card"><GastoForm ctx={ctx} gasto={gasto} documentos={docs ?? []} /></div>
      ) : <p className="card text-sm">Solo responsables y administradores pueden modificar gastos.</p>}
      {ctx.puedeGestionar && (
        <ActionForm action={eliminarRegistro} label="Eliminar gasto" danger className="flex" confirmar="¿Eliminar este gasto? Quedará constancia en el historial.">
          <input type="hidden" name="tabla" value="gastos" /><input type="hidden" name="id" value={id} />
        </ActionForm>
      )}
      <section className="card"><h2 className="mb-2 font-medium">Historial de cambios</h2><Historial tabla="gastos" id={id} /></section>
    </div>
  );
}
