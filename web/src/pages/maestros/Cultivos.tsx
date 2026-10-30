import { useState } from "react";
import { db } from "../../supabase";
import { AccionForm } from "../../forms";
import { Field, useCarga } from "../../ui";
import { fecha } from "../../lib/format";
import { alternarCultivoMaestro, crearCultivo, crearCultivoMaestro } from "../../lib/maestros";

type Arbol = { id: string; nombre: string; parcelas: { id: string; codigo: string; nombre: string | null; lotes: { id: string; codigo: string; nombre: string | null }[] }[] };
type Cat = { id: string; cultivo: string; variedad: string | null; activo: boolean };

/** Finca → parcela → lote (opcional). */
function ParcelaLote({ fincas }: { fincas: Arbol[] }) {
  const [f, setF] = useState(""), [p, setP] = useState("");
  const parcelas = fincas.find((x) => x.id === f)?.parcelas ?? [];
  const lotes = parcelas.find((x) => x.id === p)?.lotes ?? [];
  return (
    <>
      <Field label="Finca *"><select className="input" required value={f} onChange={(e) => { setF(e.target.value); setP(""); }}><option value="">Elige…</option>{fincas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
      <Field label="Parcela *"><select name="parcela_id" className="input" required value={p} onChange={(e) => setP(e.target.value)}><option value="">Elige…</option>{parcelas.map((x) => <option key={x.id} value={x.id}>{x.codigo}{x.nombre ? ` · ${x.nombre}` : ""}</option>)}</select></Field>
      <Field label="Lote (opcional)"><select name="lote_id" className="input" defaultValue="" key={p} disabled={!lotes.length}><option value="">{lotes.length ? "— toda la parcela —" : "La parcela no tiene lotes"}</option>{lotes.map((x) => <option key={x.id} value={x.id}>{x.codigo}{x.nombre ? ` · ${x.nombre}` : ""}</option>)}</select></Field>
    </>
  );
}

/** Elige un cultivo/variedad del catálogo y rellena los dos campos que espera la acción. */
function CultivoSelect({ catalogo }: { catalogo: Cat[] }) {
  const [sel, setSel] = useState("");
  const item = catalogo.find((c) => c.id === sel);
  return (
    <Field label="Cultivo y variedad (del catálogo) *">
      <select className="input" required value={sel} onChange={(e) => setSel(e.target.value)}><option value="">Elige…</option>{catalogo.map((c) => <option key={c.id} value={c.id}>{c.cultivo}{c.variedad ? ` · ${c.variedad}` : ""}</option>)}</select>
      <input type="hidden" name="cultivo" value={item?.cultivo ?? ""} /><input type="hidden" name="variedad" value={item?.variedad ?? ""} />
    </Field>
  );
}

export default function Cultivos() {
  const { datos, error, recargar } = useCarga(async () => {
    const [c, a, g, k] = await Promise.all([
      db.from("cultivos_maestro").select("id,cultivo,variedad,activo").order("cultivo"),
      db.from("fincas").select("id,nombre,parcelas(id,codigo,nombre,lotes(id,codigo,nombre))").eq("activa", true).order("nombre"),
      db.from("cultivos_parcela").select("id,cultivo,variedad,fecha_plantacion,fecha_prevista_cosecha,parcelas(codigo,fincas(nombre)),lotes(codigo),campanas(nombre)").order("cultivo"),
      db.from("campanas").select("id,nombre").order("fecha_inicio", { ascending: false }),
    ]);
    return { cat: (c.data ?? []) as Cat[], arbol: (a.data ?? []) as unknown as Arbol[], asignados: (g.data ?? []) as any[], campanas: (k.data ?? []) as { id: string; nombre: string }[] };
  }, []);
  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!datos) return <p className="text-sm text-stone-500">Cargando…</p>;
  const activos = datos.cat.filter((c) => c.activo);

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="font-medium">Catálogo de cultivos y variedades</h2>
        <p className="text-xs text-stone-500">Lista de referencia: de aquí se eligen los cultivos al asignarlos a una parcela o lote, y la variedad al registrar una cosecha en Horas.</p>
        <div className="flex flex-wrap gap-2">
          {datos.cat.map((c) => (
            <AccionForm key={c.id} accion={alternarCultivoMaestro} label={c.activo ? "Desactivar" : "Activar"} reset={false} className="flex items-center gap-2 rounded-lg border border-stone-200 px-2 py-1 text-sm" onOk={recargar}>
              <input type="hidden" name="id" value={c.id} /><input type="hidden" name="activo" value={String(!c.activo)} />
              <span className={c.activo ? "" : "text-stone-400 line-through"}>{c.cultivo}{c.variedad ? ` · ${c.variedad}` : ""}</span>
            </AccionForm>
          ))}
          {!datos.cat.length && <p className="text-sm text-stone-500">El catálogo está vacío.</p>}
        </div>
        <AccionForm accion={crearCultivoMaestro} label="Añadir al catálogo" className="grid gap-3 sm:grid-cols-3" onOk={recargar}>
          <Field label="Cultivo *"><input name="cultivo" className="input" required placeholder="Mango" /></Field>
          <Field label="Variedad"><input name="variedad" className="input" placeholder="Osteen" /></Field>
        </AccionForm>
      </section>

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Asignar un cultivo a una parcela o lote</summary>
        <div className="mt-3">
          <AccionForm accion={crearCultivo} label="Asignar cultivo" className="grid gap-3 sm:grid-cols-3" onOk={recargar}>
            <ParcelaLote fincas={datos.arbol} />
            <CultivoSelect catalogo={activos} />
            <Field label="Campaña"><select name="campana_id" className="input"><option value="">—</option>{datos.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
            <Field label="Fecha de plantación"><input type="date" name="fecha_plantacion" className="input" /></Field>
            <Field label="Próxima cosecha prevista"><input type="date" name="fecha_prevista_cosecha" className="input" /></Field>
          </AccionForm>
          {!activos.length && <p className="mt-2 text-xs text-amber-700">Primero añade algún cultivo al catálogo.</p>}
        </div>
      </details>

      <section className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Finca · parcela", "Lote", "Cultivo", "Variedad", "Campaña", "Plantación", "Cosecha prevista"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {datos.asignados.map((a) => (
              <tr key={a.id}>
                <td className="td">{a.parcelas?.fincas?.nombre} · {a.parcelas?.codigo}</td><td className="td">{a.lotes?.codigo ?? "—"}</td>
                <td className="td">{a.cultivo}</td><td className="td">{a.variedad ?? "—"}</td><td className="td">{a.campanas?.nombre ?? "—"}</td>
                <td className="td">{a.fecha_plantacion ? fecha(a.fecha_plantacion) : "—"}</td><td className="td">{a.fecha_prevista_cosecha ? fecha(a.fecha_prevista_cosecha) : "—"}</td>
              </tr>
            ))}
            {!datos.asignados.length && <tr><td className="td text-stone-500" colSpan={7}>Aún no hay cultivos asignados.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
