import { actualizarProveedor, crearProveedor } from "@/lib/actions";
import ActionForm, { Field } from "../ActionForm";
import type { cargarContexto } from "@/lib/datos";
import { NOMBRES } from "@/lib/resultados";

type Ctx = Awaited<ReturnType<typeof cargarContexto>>;
const CATS = Object.entries(NOMBRES).filter(([k]) => k !== "ventas");

export default async function SeccionProveedores({ ctx }: { ctx: Ctx }) {
  const { data } = await ctx.db.from("proveedores").select("id,nombre,nif,categoria_defecto").order("nombre");
  const provs = (data ?? []) as any[];
  const opciones = (sel: string | null) => <><option value="">Sin categoría (según el tipo de gasto)</option>{CATS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</>;
  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="font-medium">Proveedores y categoría por defecto</h2>
        <p className="text-xs text-stone-500">Las facturas recibidas de un proveedor se clasifican solas en la categoría de la Cuenta de Resultados que indiques aquí. Cambiarla afecta a las facturas nuevas; en una factura concreta se puede cambiar a mano desde el detalle de la cuenta.
          Para que se reconozca, el nombre debe coincidir con el proveedor de la factura (sin distinguir mayúsculas).</p>
        <ActionForm action={crearProveedor} label="Añadir proveedor" className="grid gap-3 sm:grid-cols-3">
          <Field label="Nombre *"><input name="nombre" className="input" required /></Field>
          <Field label="NIF/CIF"><input name="nif" className="input" /></Field>
          <Field label="Categoría por defecto"><select name="categoria_defecto" className="input" defaultValue="">{opciones(null)}</select></Field>
        </ActionForm>
      </section>
      <section className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Proveedor", "NIF", "Categoría por defecto"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {provs.map((p) => (
              <tr key={p.id}><td className="td">{p.nombre}</td><td className="td">{p.nif ?? "—"}</td>
                <td className="td">
                  <ActionForm action={actualizarProveedor} label="Guardar" reset={false} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <select name="categoria_defecto" className="input !py-1" defaultValue={p.categoria_defecto ?? ""}>{opciones(null)}</select>
                  </ActionForm>
                </td></tr>
            ))}
            {!provs.length && <tr><td className="td text-stone-500" colSpan={3}>Aún no hay proveedores.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
