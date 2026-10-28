import { alternarMemoria, crearMemoria } from "@/lib/actions";
import ActionForm, { Field } from "../ActionForm";
import type { cargarContexto } from "@/lib/datos";
import { fecha } from "@/lib/format";

type Ctx = Awaited<ReturnType<typeof cargarContexto>>;
const TIPOS: Record<string, string> = { decision: "Decisión", regla: "Regla", dato: "Dato" };

export default async function SeccionMemoria({ ctx }: { ctx: Ctx }) {
  const { data } = await ctx.db.from("memoria_chat").select("id,num,tipo,texto,activa,created_at,finca_id,fincas(nombre),profiles(nombre)").order("num", { ascending: false }).limit(500);
  const filas = (data ?? []) as any[];
  const activas = filas.filter((f) => f.activa).length;

  return (
    <div className="space-y-4">
      <section className="card space-y-2 text-sm">
        <h2 className="font-medium">Memoria del chat</h2>
        <p className="text-xs text-stone-500">
          Decisiones y reglas que el asistente recuerda <b>siempre y para todos los usuarios</b>. Se guardan desde el propio chat (el asistente lo propone y se confirma con un botón) o aquí a mano.
          Cada entrada se envía en cada mensaje, así que conviene que sean pocas, claras y vigentes ({activas} activas). La <b>memoria general</b> solo la guarda el administrador; la de una finca, también sus responsables.
          Las conversaciones largas, además, se resumen solas para no perder lo dicho al principio. Aquí no deben ir contraseñas ni datos personales.
        </p>
      </section>

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Añadir a la memoria</summary>
        <div className="mt-3">
          <ActionForm action={crearMemoria} label="Guardar en la memoria" className="grid gap-3 sm:grid-cols-3">
            <Field label="Decisión o regla *" wide><input name="texto" className="input" required maxLength={600} placeholder="Los portes de Agrocentro van siempre a Otros gastos" /></Field>
            <Field label="Tipo"><select name="tipo" className="input" defaultValue="decision"><option value="decision">Decisión</option><option value="regla">Regla</option><option value="dato">Dato de contexto</option></select></Field>
            <Field label="Finca"><select name="finca_id" className="input" defaultValue=""><option value="">General (toda la empresa)</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>Solo {f.nombre}</option>)}</select></Field>
          </ActionForm>
        </div>
      </details>

      <section className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Nº", "Tipo", "Ámbito", "Texto", "Guardada", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {filas.map((f) => (
              <tr key={f.id} className={f.activa ? "" : "text-stone-400 line-through"}>
                <td className="td">M{f.num}</td><td className="td">{TIPOS[f.tipo]}</td>
                <td className="td">{f.fincas?.nombre ?? "General"}</td><td className="td">{f.texto}</td>
                <td className="td whitespace-nowrap">{fecha(f.created_at.slice(0, 10))}{f.profiles?.nombre ? ` · ${f.profiles.nombre}` : ""}</td>
                <td className="td">
                  <ActionForm action={alternarMemoria} label={f.activa ? "Dar de baja" : "Reactivar"} reset={false} danger={f.activa} className="flex">
                    <input type="hidden" name="id" value={f.id} /><input type="hidden" name="activa" value={String(!f.activa)} />
                  </ActionForm>
                </td>
              </tr>
            ))}
            {!filas.length && <tr><td className="td text-stone-500" colSpan={6}>La memoria está vacía.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
