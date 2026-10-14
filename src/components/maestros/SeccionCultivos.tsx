import { alternarCultivoMaestro, crearCultivo, crearCultivoMaestro } from "@/lib/actions";
import ActionForm, { Field } from "../ActionForm";
import { CultivoSelect, ParcelaLote, type ArbolFinca } from "./Selectores";
import type { cargarContexto } from "@/lib/datos";
import { fecha } from "@/lib/format";

type Ctx = Awaited<ReturnType<typeof cargarContexto>>;

export default async function SeccionCultivos({ ctx }: { ctx: Ctx }) {
  const [{ data: catalogo }, { data: arbol }, { data: asignados }] = await Promise.all([
    ctx.db.from("cultivos_maestro").select("id,cultivo,variedad,activo").order("cultivo"),
    ctx.db.from("fincas").select("id,nombre,parcelas(id,codigo,nombre,lotes(id,codigo,nombre))").eq("activa", true).order("nombre"),
    ctx.db.from("cultivos_parcela")
      .select("id,cultivo,variedad,fecha_plantacion,fecha_prevista_cosecha,parcelas(codigo,fincas(nombre)),lotes(codigo),campanas(nombre)")
      .order("cultivo"),
  ]);
  const cat = (catalogo ?? []) as any[];
  const activos = cat.filter((c) => c.activo);

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="font-medium">Catálogo de cultivos y variedades</h2>
        <p className="text-xs text-stone-500">Lista de referencia: de aquí se eligen los cultivos al asignarlos a una parcela o lote, y evita nombres distintos para lo mismo.</p>
        <div className="flex flex-wrap gap-2">
          {cat.map((c) => (
            <ActionForm key={c.id} action={alternarCultivoMaestro} label={c.activo ? "Desactivar" : "Activar"} reset={false} className="flex items-center gap-2 rounded-lg border border-stone-200 px-2 py-1 text-sm">
              <input type="hidden" name="id" value={c.id} /><input type="hidden" name="activo" value={String(!c.activo)} />
              <span className={c.activo ? "" : "text-stone-400 line-through"}>{c.cultivo}{c.variedad ? ` · ${c.variedad}` : ""}</span>
            </ActionForm>
          ))}
          {!cat.length && <p className="text-sm text-stone-500">El catálogo está vacío.</p>}
        </div>
        <ActionForm action={crearCultivoMaestro} label="Añadir al catálogo" className="grid gap-3 sm:grid-cols-3">
          <Field label="Cultivo *"><input name="cultivo" className="input" required placeholder="Mango" /></Field>
          <Field label="Variedad"><input name="variedad" className="input" placeholder="Osteen" /></Field>
        </ActionForm>
      </section>

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Asignar un cultivo a una parcela o lote</summary>
        <div className="mt-3">
          <ActionForm action={crearCultivo} label="Asignar cultivo" className="grid gap-3 sm:grid-cols-3">
            <ParcelaLote fincas={(arbol ?? []) as ArbolFinca[]} />
            <CultivoSelect catalogo={activos} />
            <Field label="Campaña"><select name="campana_id" className="input"><option value="">—</option>{ctx.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
            <Field label="Fecha de plantación"><input type="date" name="fecha_plantacion" className="input" /></Field>
            <Field label="Próxima cosecha prevista"><input type="date" name="fecha_prevista_cosecha" className="input" /></Field>
          </ActionForm>
          {!activos.length && <p className="mt-2 text-xs text-amber-700">Primero añade algún cultivo al catálogo.</p>}
        </div>
      </details>

      <section className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Finca · parcela", "Lote", "Cultivo", "Variedad", "Campaña", "Plantación", "Cosecha prevista"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {((asignados ?? []) as any[]).map((a) => (
              <tr key={a.id}>
                <td className="td">{a.parcelas?.fincas?.nombre} · {a.parcelas?.codigo}</td><td className="td">{a.lotes?.codigo ?? "—"}</td>
                <td className="td">{a.cultivo}</td><td className="td">{a.variedad ?? "—"}</td><td className="td">{a.campanas?.nombre ?? "—"}</td>
                <td className="td">{a.fecha_plantacion ? fecha(a.fecha_plantacion) : "—"}</td><td className="td">{a.fecha_prevista_cosecha ? fecha(a.fecha_prevista_cosecha) : "—"}</td>
              </tr>
            ))}
            {!(asignados ?? []).length && <tr><td className="td text-stone-500" colSpan={7}>Aún no hay cultivos asignados.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
