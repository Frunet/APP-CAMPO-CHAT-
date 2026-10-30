import { db } from "../../supabase";
import { AccionForm } from "../../forms";
import { Field, useCarga } from "../../ui";
import { num } from "../../lib/format";
import { actualizarFinca, actualizarLote, actualizarParcela, crearCampana, crearFinca, crearLote, crearParcela } from "../../lib/maestros";

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

export default function Fincas() {
  const { datos, error, recargar } = useCarga(async () => {
    const { data, error } = await db.from("fincas")
      .select("id,codigo,nombre,ubicacion,tipo_explotacion,superficie_ha,observaciones,activa,parcelas(id,codigo,nombre,superficie_ha,estado,observaciones,lotes(id,codigo,nombre,superficie_ha,estado,observaciones))")
      .order("nombre");
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  }, []);
  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!datos) return <p className="text-sm text-stone-500">Cargando…</p>;
  const estados = (d?: string) => ESTADOS.map((e) => <option key={e} value={e}>{e}</option>);

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">Estructura: <b>finca → parcela → lote</b>. Los lotes son opcionales: una parcela puede tener lotes o no, y los registros se pueden hacer a nivel de parcela o de lote.</p>

      <Panel titulo="＋ Nueva finca">
        <AccionForm accion={crearFinca} label="Crear finca" onOk={recargar}>
          <Field label="Código *"><input name="codigo" className="input" required /></Field>
          <Field label="Nombre *"><input name="nombre" className="input" required /></Field>
          <Field label="Tipo de explotación"><select name="tipo_explotacion" className="input">{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
          <Field label="Superficie total (ha)"><input name="superficie_ha" inputMode="decimal" className="input" /></Field>
          <Field label="Ubicación" wide><input name="ubicacion" className="input" /></Field>
          <Field label="Observaciones" wide><textarea name="observaciones" className="input" rows={2} /></Field>
        </AccionForm>
      </Panel>

      {datos.map((f) => (
        <section key={f.id} className="card space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">{f.nombre} <span className="text-xs text-stone-400">{f.codigo}</span>{!f.activa && <span className="text-sm text-red-600"> · inactiva</span>}</h2>
            <span className="text-sm text-stone-500">{f.tipo_explotacion} · {num(f.superficie_ha, 2)} ha</span>
          </div>

          <details>
            <summary className="cursor-pointer text-xs text-brand-700">Editar finca</summary>
            <div className="mt-2">
              <AccionForm accion={actualizarFinca} label="Guardar finca" reset={false} className="grid gap-3 sm:grid-cols-3" onOk={recargar}>
                <input type="hidden" name="id" value={f.id} />
                <Field label="Nombre *"><input name="nombre" className="input" required defaultValue={f.nombre} /></Field>
                <Field label="Tipo"><select name="tipo_explotacion" className="input" defaultValue={f.tipo_explotacion}>{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
                <Field label="Superficie (ha)"><input name="superficie_ha" inputMode="decimal" className="input" defaultValue={f.superficie_ha ?? ""} /></Field>
                <Field label="Ubicación" wide><input name="ubicacion" className="input" defaultValue={f.ubicacion ?? ""} /></Field>
                <Field label="Observaciones" wide><input name="observaciones" className="input" defaultValue={f.observaciones ?? ""} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activa" defaultChecked={f.activa} /> Finca activa</label>
              </AccionForm>
            </div>
          </details>

          <div className="space-y-2">
            {(f.parcelas ?? []).map((p: any) => (
              <details key={p.id} className="rounded-lg border border-stone-200 px-3 py-2">
                <summary className="cursor-pointer text-sm">
                  <b>{p.codigo}</b>{p.nombre ? ` · ${p.nombre}` : ""} — {num(p.superficie_ha, 2)} ha · {p.estado} · <span className="text-stone-500">{(p.lotes ?? []).length} lote(s)</span>
                </summary>
                <div className="mt-3 space-y-3">
                  <AccionForm accion={actualizarParcela} label="Guardar parcela" reset={false} className="grid gap-3 sm:grid-cols-4" onOk={recargar}>
                    <input type="hidden" name="id" value={p.id} />
                    <Field label="Nombre"><input name="nombre" className="input" defaultValue={p.nombre ?? ""} /></Field>
                    <Field label="Ha"><input name="superficie_ha" inputMode="decimal" className="input" defaultValue={p.superficie_ha ?? ""} /></Field>
                    <Field label="Estado"><select name="estado" className="input" defaultValue={p.estado}>{estados()}</select></Field>
                    <Field label="Observaciones"><input name="observaciones" className="input" defaultValue={p.observaciones ?? ""} /></Field>
                  </AccionForm>

                  <div className="rounded-lg bg-stone-50 p-2">
                    <h3 className="mb-1 text-xs font-medium text-stone-600">Lotes de la parcela (opcional)</h3>
                    {(p.lotes ?? []).map((l: any) => (
                      <details key={l.id} className="py-1">
                        <summary className="cursor-pointer text-sm"><b>{l.codigo}</b>{l.nombre ? ` · ${l.nombre}` : ""} — {num(l.superficie_ha, 2)} ha · {l.estado}</summary>
                        <div className="mt-2">
                          <AccionForm accion={actualizarLote} label="Guardar lote" reset={false} className="grid gap-3 sm:grid-cols-4" onOk={recargar}>
                            <input type="hidden" name="id" value={l.id} />
                            <Field label="Nombre"><input name="nombre" className="input" defaultValue={l.nombre ?? ""} /></Field>
                            <Field label="Ha"><input name="superficie_ha" inputMode="decimal" className="input" defaultValue={l.superficie_ha ?? ""} /></Field>
                            <Field label="Estado"><select name="estado" className="input" defaultValue={l.estado}>{estados()}</select></Field>
                            <Field label="Observaciones"><input name="observaciones" className="input" defaultValue={l.observaciones ?? ""} /></Field>
                          </AccionForm>
                        </div>
                      </details>
                    ))}
                    {!(p.lotes ?? []).length && <p className="text-xs text-stone-500">Sin lotes: los registros se hacen a nivel de parcela.</p>}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-medium text-brand-700">＋ Nuevo lote en {p.codigo}</summary>
                      <div className="mt-2">
                        <AccionForm accion={crearLote} label="Crear lote" className="grid gap-3 sm:grid-cols-4" onOk={recargar}>
                          <input type="hidden" name="parcela_id" value={p.id} />
                          <Field label="Código *"><input name="codigo" className="input" required placeholder="L1" /></Field>
                          <Field label="Nombre"><input name="nombre" className="input" /></Field>
                          <Field label="Ha"><input name="superficie_ha" inputMode="decimal" className="input" /></Field>
                          <Field label="Estado"><select name="estado" className="input">{estados()}</select></Field>
                        </AccionForm>
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
              <AccionForm accion={crearParcela} label="Crear parcela" className="grid gap-3 sm:grid-cols-4" onOk={recargar}>
                <input type="hidden" name="finca_id" value={f.id} />
                <Field label="Código *"><input name="codigo" className="input" required placeholder="P5" /></Field>
                <Field label="Nombre"><input name="nombre" className="input" /></Field>
                <Field label="Ha"><input name="superficie_ha" inputMode="decimal" className="input" /></Field>
                <Field label="Estado"><select name="estado" className="input">{estados()}</select></Field>
              </AccionForm>
            </div>
          </details>
        </section>
      ))}
      {!datos.length && <p className="card text-sm text-stone-500">Aún no hay fincas. Crea la primera arriba.</p>}

      <Panel titulo="＋ Nueva campaña agrícola">
        <AccionForm accion={crearCampana} label="Crear campaña">
          <Field label="Nombre *"><input name="nombre" className="input" required placeholder="2026/27" /></Field>
          <Field label="Inicio *"><input type="date" name="fecha_inicio" className="input" required /></Field>
          <Field label="Fin"><input type="date" name="fecha_fin" className="input" /></Field>
        </AccionForm>
      </Panel>
    </div>
  );
}
