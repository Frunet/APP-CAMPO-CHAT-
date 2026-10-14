import { createClient } from "@/lib/supabase/server";
import { cargarContexto } from "@/lib/datos";
import { actualizarParcela, crearCampana, crearCultivo, crearFinca, crearParcela } from "@/lib/actions";
import ActionForm, { Field } from "@/components/ActionForm";
import { num } from "@/lib/format";

const ESTADOS = ["activa", "en_preparacion", "en_descanso", "inactiva"];

function Panel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="card">
      <summary className="cursor-pointer text-sm font-medium text-brand-700">{titulo}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export default async function Fincas({ searchParams }: { searchParams: Promise<{ finca?: string; cultivo?: string; campana?: string }> }) {
  const q = await searchParams;
  const ctx = await cargarContexto();
  const db = await createClient();

  const { data: fincas } = await db
    .from("fincas")
    .select("id,codigo,nombre,ubicacion,tipo_explotacion,superficie_ha,parcelas(id,codigo,nombre,superficie_ha,estado,observaciones,cultivos_parcela(id,cultivo,variedad,fecha_plantacion,fecha_prevista_cosecha,campana_id))")
    .order("nombre");

  // Filtros por finca, cultivo y campaña
  const vista = (fincas ?? [])
    .filter((f) => !q.finca || f.id === q.finca)
    .map((f) => ({
      ...f,
      parcelas: (f.parcelas ?? [])
        .map((p) => ({
          ...p,
          cultivos_parcela: (p.cultivos_parcela ?? []).filter(
            (c) => (!q.campana || c.campana_id === q.campana) && (!q.cultivo || c.cultivo.toLowerCase().includes(q.cultivo.toLowerCase())),
          ),
        }))
        .filter((p) => (!q.cultivo && !q.campana) || p.cultivos_parcela.length > 0),
    }));

  const parcelasPlano = ctx.fincas.flatMap((f) => f.parcelas.map((p) => ({ id: p.id, texto: `${f.nombre} · ${p.codigo}` })));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Fincas y parcelas</h1>

      <form className="card grid gap-3 sm:grid-cols-4" method="get">
        <Field label="Finca">
          <select name="finca" className="input" defaultValue={q.finca ?? ""}>
            <option value="">Todas</option>
            {ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </Field>
        <Field label="Cultivo"><input name="cultivo" className="input" defaultValue={q.cultivo ?? ""} placeholder="Mango…" /></Field>
        <Field label="Campaña">
          <select name="campana" className="input" defaultValue={q.campana ?? ""}>
            <option value="">Todas</option>
            {ctx.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Field>
        <div className="flex items-end"><button className="btn w-full">Filtrar</button></div>
      </form>

      {ctx.esAdmin && (
        <Panel titulo="＋ Nueva finca">
          <ActionForm action={crearFinca} label="Crear finca">
            <Field label="Código *"><input name="codigo" className="input" required /></Field>
            <Field label="Nombre *"><input name="nombre" className="input" required /></Field>
            <Field label="Tipo de explotación">
              <select name="tipo_explotacion" className="input"><option value="propia">Propia</option><option value="arrendada">Arrendada</option><option value="terceros">Gestionada por terceros</option></select>
            </Field>
            <Field label="Superficie total (ha)"><input name="superficie_ha" inputMode="decimal" className="input" /></Field>
            <Field label="Ubicación" wide><input name="ubicacion" className="input" /></Field>
            <Field label="Observaciones" wide><textarea name="observaciones" className="input" rows={2} /></Field>
          </ActionForm>
        </Panel>
      )}

      {ctx.puedeGestionar && (
        <>
          <Panel titulo="＋ Nueva parcela">
            <ActionForm action={crearParcela} label="Crear parcela">
              <Field label="Finca *">
                <select name="finca_id" className="input" required><option value="">Elige…</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select>
              </Field>
              <Field label="Código *"><input name="codigo" className="input" required placeholder="P3" /></Field>
              <Field label="Nombre"><input name="nombre" className="input" /></Field>
              <Field label="Superficie (ha)"><input name="superficie_ha" inputMode="decimal" className="input" /></Field>
              <Field label="Estado"><select name="estado" className="input">{ESTADOS.map((e) => <option key={e}>{e}</option>)}</select></Field>
              <Field label="Observaciones" wide><input name="observaciones" className="input" /></Field>
            </ActionForm>
          </Panel>
          <Panel titulo="＋ Añadir cultivo / variedad a una parcela">
            <ActionForm action={crearCultivo} label="Añadir cultivo">
              <Field label="Parcela *">
                <select name="parcela_id" className="input" required><option value="">Elige…</option>{parcelasPlano.map((p) => <option key={p.id} value={p.id}>{p.texto}</option>)}</select>
              </Field>
              <Field label="Cultivo *"><input name="cultivo" className="input" required placeholder="Mango" /></Field>
              <Field label="Variedad"><input name="variedad" className="input" placeholder="Osteen" /></Field>
              <Field label="Campaña">
                <select name="campana_id" className="input"><option value="">—</option>{ctx.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
              </Field>
              <Field label="Fecha de plantación"><input type="date" name="fecha_plantacion" className="input" /></Field>
              <Field label="Próxima cosecha prevista"><input type="date" name="fecha_prevista_cosecha" className="input" /></Field>
            </ActionForm>
          </Panel>
        </>
      )}

      {ctx.esAdmin && (
        <Panel titulo="＋ Nueva campaña agrícola">
          <ActionForm action={crearCampana} label="Crear campaña">
            <Field label="Nombre *"><input name="nombre" className="input" required placeholder="2026/27" /></Field>
            <Field label="Inicio *"><input type="date" name="fecha_inicio" className="input" required /></Field>
            <Field label="Fin"><input type="date" name="fecha_fin" className="input" /></Field>
          </ActionForm>
        </Panel>
      )}

      {!vista.length && <p className="card text-sm text-stone-500">No hay fincas que mostrar. Un administrador debe crearlas y asignarte acceso.</p>}
      {vista.map((f) => (
        <section key={f.id} className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">{f.nombre} <span className="text-xs text-stone-400">{f.codigo}</span></h2>
            <span className="text-sm text-stone-500">{f.tipo_explotacion} · {num(f.superficie_ha, 2)} ha · {f.ubicacion ?? "sin ubicación"}</span>
          </div>
          <div className="mt-2 space-y-2">
            {f.parcelas.map((p) => (
              <details key={p.id} className="rounded-lg border border-stone-200 px-3 py-2">
                <summary className="cursor-pointer text-sm">
                  <b>{p.codigo}</b>{p.nombre ? ` · ${p.nombre}` : ""} — {num(p.superficie_ha, 2)} ha · {p.estado} ·{" "}
                  {p.cultivos_parcela.map((c) => `${c.cultivo}${c.variedad ? ` ${c.variedad}` : ""}`).join(", ") || "sin cultivos"}
                </summary>
                {p.cultivos_parcela.length > 0 && (
                  <ul className="mt-2 text-xs text-stone-600">
                    {p.cultivos_parcela.map((c) => (
                      <li key={c.id}>• {c.cultivo} {c.variedad ?? ""} {c.fecha_plantacion ? `· plantado ${c.fecha_plantacion}` : ""} {c.fecha_prevista_cosecha ? `· cosecha prevista ${c.fecha_prevista_cosecha}` : ""}</li>
                    ))}
                  </ul>
                )}
                {ctx.puedeGestionar && (
                  <div className="mt-3">
                    <ActionForm action={actualizarParcela} label="Guardar cambios" reset={false} className="grid gap-3 sm:grid-cols-4">
                      <input type="hidden" name="id" value={p.id} />
                      <Field label="Nombre"><input name="nombre" className="input" defaultValue={p.nombre ?? ""} /></Field>
                      <Field label="Ha"><input name="superficie_ha" inputMode="decimal" className="input" defaultValue={p.superficie_ha ?? ""} /></Field>
                      <Field label="Estado"><select name="estado" className="input" defaultValue={p.estado}>{ESTADOS.map((e) => <option key={e}>{e}</option>)}</select></Field>
                      <Field label="Observaciones"><input name="observaciones" className="input" defaultValue={p.observaciones ?? ""} /></Field>
                    </ActionForm>
                  </div>
                )}
              </details>
            ))}
            {!f.parcelas.length && <p className="text-sm text-stone-500">Sin parcelas para este filtro.</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
