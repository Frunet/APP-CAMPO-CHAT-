import Link from "next/link";
import { cargarContexto } from "@/lib/datos";
import { alternarRegla, crearReglasBase, eliminarRegla } from "@/lib/actions";
import ActionForm from "@/components/ActionForm";
import AccionesAviso from "@/components/AccionesAviso";
import ReglaForm from "@/components/ReglaForm";
import { TIPOS_REGLA } from "@/lib/avisos/tipos";
import { fecha } from "@/lib/format";

const ORDEN: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
const COLOR: Record<string, string> = { critica: "bg-red-100 text-red-800", alta: "bg-orange-100 text-orange-800", media: "bg-amber-100 text-amber-800", baja: "bg-stone-100 text-stone-700" };
const ESTADOS = [["pendiente", "Pendientes"], ["leido", "Leídos"], ["pospuesto", "Pospuestos"], ["resuelto", "Resueltos"], ["todos", "Todos"]];

export default async function Avisos({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const q = await searchParams;
  const estado = q.estado ?? "pendiente";
  const ctx = await cargarContexto();

  let qb = ctx.db.from("avisos").select("id,titulo,mensaje,prioridad,estado,tipo,created_at,pospuesto_hasta,fincas(nombre)").order("created_at", { ascending: false }).limit(200);
  if (estado !== "todos") qb = qb.eq("estado", estado);
  const [{ data: avisos }, { data: reglas }, { data: tareas }, perfiles] = await Promise.all([
    qb,
    ctx.puedeGestionar ? ctx.db.from("avisos_reglas").select("*").order("created_at") : Promise.resolve({ data: [] as any[] }),
    ctx.db.from("tareas").select("id,titulo,fecha,semana_inicio,tipo").eq("completada", false).order("fecha").limit(8),
    ctx.esAdmin ? ctx.db.from("profiles").select("id,nombre,rol").eq("activo", true).order("nombre") : Promise.resolve({ data: undefined }),
  ]);
  const ordenados = [...(avisos ?? [])].sort((a: any, b: any) => ORDEN[a.prioridad] - ORDEN[b.prioridad]);
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Avisos y tareas</h1>

      <div className="flex flex-wrap gap-2">
        {ESTADOS.map(([v, t]) => (
          <Link key={v} href={`/avisos?estado=${v}`} className={`rounded-full border px-3 py-1 text-sm ${estado === v ? "border-brand-600 bg-brand-100 text-brand-900" : "border-stone-300 bg-white"}`}>{t}</Link>
        ))}
      </div>

      <div className="space-y-2">
        {ordenados.map((a: any) => (
          <div key={a.id} className="card">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${COLOR[a.prioridad]}`}>{a.prioridad}</span>
              <b>{a.titulo}</b>
              <span className="ml-auto text-xs text-stone-400">{new Date(a.created_at).toLocaleDateString("es-ES")}</span>
            </div>
            {a.mensaje && <p className="mt-1 whitespace-pre-line text-sm text-stone-600">{a.mensaje}</p>}
            {a.estado === "pospuesto" && a.pospuesto_hasta && <p className="mt-1 text-xs text-stone-500">Pospuesto hasta {new Date(a.pospuesto_hasta).toLocaleDateString("es-ES")}</p>}
            <AccionesAviso id={a.id} estado={a.estado} />
          </div>
        ))}
        {!ordenados.length && <p className="card text-sm text-stone-500">No hay avisos en esta vista.</p>}
      </div>

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium">Próximas tareas</h2>
          <Link href="/calendario" className="text-sm text-brand-700">Calendario →</Link>
        </div>
        {tareas?.length ? tareas.map((t) => {
          const vencida = !!t.fecha && t.fecha < hoy;
          const cuando = t.fecha ? fecha(t.fecha) : t.semana_inicio ? `Semana del ${t.semana_inicio.slice(8)}/${t.semana_inicio.slice(5, 7)}` : "Sin fecha";
          return <p key={t.id} className={`text-sm ${vencida ? "text-red-600" : ""}`}>• {cuando} · {t.titulo}{vencida ? " (vencida)" : ""}</p>;
        }) : <p className="text-sm text-stone-500">Sin tareas pendientes.</p>}
      </section>

      {ctx.puedeGestionar && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">Reglas de aviso automático</h2>
            <ActionForm action={crearReglasBase} label="Crear reglas recomendadas" reset={false} className="flex"><span /></ActionForm>
          </div>
          <p className="text-xs text-stone-500">Se evalúan en segundo plano cada hora, aunque nadie tenga la aplicación abierta. Un mismo aviso no se repite para la misma persona.</p>
          {reglas?.map((r: any) => (
            <details key={r.id} className="rounded-lg border border-stone-200 px-3 py-2">
              <summary className="cursor-pointer text-sm">
                <b>{r.nombre}</b> · {TIPOS_REGLA[r.tipo]?.etiqueta} · {r.periodicidad} {r.hora.slice(0, 5)} · {r.prioridad}
                {!r.activa && <span className="text-red-600"> · desactivada</span>}
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs text-stone-500">{TIPOS_REGLA[r.tipo]?.ayuda}{r.ultima_ejecucion ? ` Última ejecución: ${new Date(r.ultima_ejecucion).toLocaleString("es-ES")}.` : " Aún no se ha ejecutado."}</p>
                <ReglaForm regla={r} fincas={ctx.fincas} perfiles={perfiles.data ?? undefined} />
                <div className="flex gap-2">
                  <ActionForm action={alternarRegla} label={r.activa ? "Desactivar" : "Activar"} reset={false} className="flex">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="activa" value={String(!r.activa)} />
                  </ActionForm>
                  <ActionForm action={eliminarRegla} label="Eliminar" danger reset={false} className="flex" confirmar="¿Eliminar esta regla? Los avisos ya generados se conservan.">
                    <input type="hidden" name="id" value={r.id} />
                  </ActionForm>
                </div>
              </div>
            </details>
          ))}
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Nueva regla</summary>
            <div className="mt-3"><ReglaForm fincas={ctx.fincas} perfiles={perfiles.data ?? undefined} /></div>
          </details>
        </section>
      )}
    </div>
  );
}
