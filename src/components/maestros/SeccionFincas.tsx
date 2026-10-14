import { actualizarFinca, actualizarLote, actualizarParcela, crearCampana, crearFinca, crearLote, crearParcela } from "@/lib/actions";
import ActionForm, { Field } from "../ActionForm";
import type { cargarContexto } from "@/lib/datos";
import { num } from "@/lib/format";

type Ctx = Awaited<ReturnType<typeof cargarContexto>>;
const ESTADOS = ["activa", "en_preparacion", "en_descanso", "inactiva"];
const TIPOS = [["propia", "Propia"], ["arrendada", "Arrendada"], ["terceros", "Gestionada por terceros"]];

function Panel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="card">
      <summary className="cursor-pointer text-sm font-medium text-brand-700">{titulo}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export default async function SeccionFincas({ ctx }: { ctx: Ctx }) {
  const { data } = await ctx.db.from("fincas")
    .select("id,codigo,nombre,ubicacion,tipo_explotacion,superficie_ha,observaciones,activa,parcelas(id,codigo,nombre,superficie_ha,estado,observaciones,lotes(id,codigo,nombre,superficie_ha,estado,observaciones))")
    .order("nombre");
  const fincas = (data ?? []) as any[];

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        Estructura: <b>finca → parcela → lote</b>. Los lotes son opcionales: una parcela puede tener lotes o no, y los registros se pueden hacer a nivel de parcela o de lote.
      </p>

      <Panel titulo="＋ Nueva finca">
        <ActionForm action={crearFinca} label="Crear finca">
          <Field label="Código *"><input name="codigo" className="input" required /></Field>
          <Field label="Nombre *"><input name="nombre" className="input" required /></Field>
          <Field label="Tipo de explotación"><select name="tipo_explotacion" className="input">{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
          <Field label="Superficie total (ha)"><input name="superficie_ha" inputMode="decimal" className="input" /></Field>
          <Field label="Ubicación" wide><input name="ubicacion" className="input" /></Field>
          <Field label="Observaciones" wide><textarea name="observaciones" className="input" rows={2} /></Field>
        </ActionForm>
      </Panel>

      {fincas.map((f) => (
        <section key={f.id} className="card space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">{f.nombre} <span className="text-xs text-stone-400">{f.codigo}</span>{!f.activa && <span className="text-sm text-red-600"> · inactiva</span>}</h2>
            <span className="text-sm text-stone-500">{f.tipo_explotacion} · {num(f.superficie_ha, 2)} ha</span>
          </div>

          <details>
            <summary className="cursor-pointer text-xs text-brand-700">Editar finca</summary>
            <div className="mt-2">
              <ActionForm action={actualizarFinca} label="Guardar finca" reset={false} className="grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="id" value={f.id} />
                <Field label="Nombre *"><input name="nombre" className="input" required defaultValue={f.nombre} /></Field>
                <Field label="Tipo"><select name="tipo_explotacion" className="input" defaultValue={f.tipo_explotacion}>{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
                <Field label="Superficie (ha)"><input name="superficie_ha" inputMode="decimal" className="input" defaultValue={f.superficie_ha ?? ""} /></Field>
                <Field label="Ubicación" wide><input name="ubicacion" className="input" defaultValue={f.ubicacion ?? ""} /></Field>
                <Field label="Observaciones" wide><input name="observaciones" className="input" defaultValue={f.observaciones ?? ""} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activa" defaultChecked={f.activa} /> Finca activa</label>
              </ActionForm>
            </div>
          </details>

          <div className="space-y-2">
            {(f.parcelas ?? []).map((p: any) => (
              <details key={p.id} className="rounded-lg border border-stone-200 px-3 py-2">
                <summary className="cursor-pointer text-sm">
                  <b>{p.codigo}</b>{p.nombre ? ` · ${p.nombre}` : ""} — {num(p.superficie_ha, 2)} ha · {p.estado} · <span className="text-stone-500">{(p.lotes ?? []).length} lote(s)</span>
                </summary>
                <div className="mt-3 space-y-3">
                  <ActionForm action={actualizarParcela} label="Guardar parcela" reset={false} className="grid gap-3 sm:grid-cols-4">
                    <input type="hidden" name="id" value={p.id} />
                    <Field label="Nombre"><input name="nombre" className="input" defaultValue={p.nombre ?? ""} /></Field>
                    <Field label="Ha"><input name="superficie_ha" inputMode="decimal" className="input" defaultValue={p.superficie_ha ?? ""} /></Field>
                    <Field label="Estado"><select name="estado" className="input" defaultValue={p.estado}>{ESTADOS.map((e) => <option key={e}>{e}</option>)}</select></Field>
                    <Field label="Observaciones"><input name="observaciones" className="input" defaultValue={p.observaciones ?? ""} /></Field>
                  </ActionForm>

                  <div className="rounded-lg bg-stone-50 p-2">
                    <h3 className="mb-1 text-xs font-medium text-stone-600">Lotes de la parcela (opcional)</h3>
                    {(p.lotes ?? []).map((l: any) => (
                      <details key={l.id} className="py-1">
                        <summary className="cursor-pointer text-sm"><b>{l.codigo}</b>{l.nombre ? ` · ${l.nombre}` : ""} — {num(l.superficie_ha, 2)} ha · {l.estado}</summary>
                        <div className="mt-2">
                          <ActionForm action={actualizarLote} label="Guardar lote" reset={false} className="grid gap-3 sm:grid-cols-4">
                            <input type="hidden" name="id" value={l.id} />
                            <Field label="Nombre"><input name="nombre" className="input" defaultValue={l.nombre ?? ""} /></Field>
                            <Field label="Ha"><input name="superficie_ha" inputMode="decimal" className="input" defaultValue={l.superficie_ha ?? ""} /></Field>
                            <Field label="Estado"><select name="estado" className="input" defaultValue={l.estado}>{ESTADOS.map((e) => <option key={e}>{e}</option>)}</select></Field>
                            <Field label="Observaciones"><input name="observaciones" className="input" defaultValue={l.observaciones ?? ""} /></Field>
                          </ActionForm>
                        </div>
                      </details>
                    ))}
                    {!(p.lotes ?? []).length && <p className="text-xs text-stone-500">Sin lotes: los registros se hacen a nivel de parcela.</p>}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-medium text-brand-700">＋ Nuevo lote en {p.codigo}</summary>
                      <div className="mt-2">
                        <ActionForm action={crearLote} label="Crear lote" className="grid gap-3 sm:grid-cols-4">
                          <input type="hidden" name="parcela_id" value={p.id} />
                          <Field label="Código *"><input name="codigo" className="input" required placeholder="L1" /></Field>
                          <Field label="Nombre"><input name="nombre" className="input" /></Field>
                          <Field label="Ha"><input name="superficie_ha" inputMode="decimal" className="input" /></Field>
                          <Field label="Estado"><select name="estado" className="input">{ESTADOS.map((e) => <option key={e}>{e}</option>)}</select></Field>
                        </ActionForm>
                      </div>
                    </details>
                  </div>
                </div>
              </details>
            ))}
            {!(f.parcelas ?? []).length && <p className="text-sm text-stone-500">Esta finca aún no tiene parcelas.</p>}
          </div>

          <details>
            <summary className="cursor-pointer text-xs font-medium text-brand-700">＋ Nueva parcela en {f.nombre}</summary>
            <div className="mt-2">
              <ActionForm action={crearParcela} label="Crear parcela" className="grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="finca_id" value={f.id} />
                <Field label="Código *"><input name="codigo" className="input" required placeholder="P5" /></Field>
                <Field label="Nombre"><input name="nombre" className="input" /></Field>
                <Field label="Ha"><input name="superficie_ha" inputMode="decimal" className="input" /></Field>
                <Field label="Estado"><select name="estado" className="input">{ESTADOS.map((e) => <option key={e}>{e}</option>)}</select></Field>
              </ActionForm>
            </div>
          </details>
        </section>
      ))}
      {!fincas.length && <p className="card text-sm text-stone-500">Aún no hay fincas. Crea la primera arriba.</p>}

      <Panel titulo="＋ Nueva campaña agrícola">
        <ActionForm action={crearCampana} label="Crear campaña">
          <Field label="Nombre *"><input name="nombre" className="input" required placeholder="2026/27" /></Field>
          <Field label="Inicio *"><input type="date" name="fecha_inicio" className="input" required /></Field>
          <Field label="Fin"><input type="date" name="fecha_fin" className="input" /></Field>
        </ActionForm>
      </Panel>
    </div>
  );
}
