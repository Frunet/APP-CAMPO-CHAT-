import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cargarContexto } from "@/lib/datos";
import { Field } from "@/components/ActionForm";
import { fecha, num } from "@/lib/format";

type Q = { finca?: string; cultivo?: string; campana?: string };

export default async function Fincas({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const ctx = await cargarContexto();
  const db = await createClient();

  const { data: fincas } = await db
    .from("fincas")
    .select("id,codigo,nombre,ubicacion,tipo_explotacion,superficie_ha,parcelas(id,codigo,nombre,superficie_ha,estado,lotes(id,codigo,nombre,superficie_ha,estado),cultivos_parcela(id,cultivo,variedad,fecha_plantacion,fecha_prevista_cosecha,campana_id,lote_id))")
    .eq("activa", true)
    .order("nombre");

  // Filtros por finca, cultivo y campaña
  const vista = ((fincas ?? []) as any[])
    .filter((f) => !q.finca || f.id === q.finca)
    .map((f) => ({
      ...f,
      parcelas: (f.parcelas ?? [])
        .map((p: any) => ({
          ...p,
          cultivos_parcela: (p.cultivos_parcela ?? []).filter(
            (c: any) => (!q.campana || c.campana_id === q.campana) && (!q.cultivo || c.cultivo.toLowerCase().includes(q.cultivo.toLowerCase())),
          ),
        }))
        .filter((p: any) => (!q.cultivo && !q.campana) || p.cultivos_parcela.length > 0),
    }));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Fincas y parcelas</h1>
      <p className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
        Pantalla de consulta.{" "}
        {ctx.esAdmin ? <>Las fincas, parcelas, lotes y cultivos se crean y editan en <Link href="/maestros?seccion=fincas" className="text-brand-700">Maestros →</Link></> : "Las altas y cambios los realiza el administrador."}
      </p>

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

      {!vista.length && <p className="card text-sm text-stone-500">No hay fincas que mostrar. El administrador debe crearlas y asignarte acceso.</p>}
      {vista.map((f) => (
        <section key={f.id} className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">{f.nombre} <span className="text-xs text-stone-400">{f.codigo}</span></h2>
            <span className="text-sm text-stone-500">{f.tipo_explotacion} · {num(f.superficie_ha, 2)} ha · {f.ubicacion ?? "sin ubicación"}</span>
          </div>
          <div className="mt-2 space-y-2">
            {f.parcelas.map((p: any) => (
              <div key={p.id} className="rounded-lg border border-stone-200 px-3 py-2 text-sm">
                <div>
                  <b>{p.codigo}</b>{p.nombre ? ` · ${p.nombre}` : ""} — {num(p.superficie_ha, 2)} ha · {p.estado}
                </div>
                <div className="text-xs text-stone-600">
                  Cultivos: {p.cultivos_parcela.length
                    ? p.cultivos_parcela.map((c: any) => `${c.cultivo}${c.variedad ? ` ${c.variedad}` : ""}${c.fecha_prevista_cosecha ? ` (cosecha prevista ${fecha(c.fecha_prevista_cosecha)})` : ""}`).join(" · ")
                    : "sin cultivos"}
                </div>
                {(p.lotes ?? []).length > 0 && (
                  <div className="mt-1 text-xs text-stone-600">
                    Lotes: {(p.lotes as any[]).map((l) => `${l.codigo}${l.nombre ? ` · ${l.nombre}` : ""} (${num(l.superficie_ha, 2)} ha)`).join(" · ")}
                  </div>
                )}
              </div>
            ))}
            {!f.parcelas.length && <p className="text-sm text-stone-500">Sin parcelas para este filtro.</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
