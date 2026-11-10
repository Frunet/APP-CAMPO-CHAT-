import { useState } from "react";
import { useAuth } from "../auth";
import { db } from "../supabase";
import { Field, useCarga } from "../ui";
import { Link } from "../router";
import { fecha, iso, num } from "../lib/format";
import { grupoPersonal, GRUPOS_PERSONAL } from "../lib/grupos-personal";
import { partesPeriodo } from "../lib/leer-operativa";
import { avisosHoras, type ParteOperativo } from "../lib/operativa";

function TrabajosRealizados({ partes }: { partes: ParteOperativo[] }) {
  const tareas = new Map<string, { tarea: string; mayor: string; detalle: string; horas: number }>();
  for (const p of partes) {
    const tarea = p.tipo_trabajo?.trim() || p.mayor?.trim() || "Sin tarea especificada";
    const mayor = p.mayor?.trim() || "", detalle = p.actividad?.trim() || "";
    const clave = JSON.stringify([mayor, tarea, detalle]);
    const fila = tareas.get(clave) ?? { tarea, mayor, detalle, horas: 0 };
    fila.horas += Number(p.horas_totales); tareas.set(clave, fila);
  }
  return <div className="space-y-2 border-t border-stone-200 pt-3">
    <h3 className="text-sm font-bold">Trabajos realizados</h3>
    <ul className="space-y-2">{[...tareas.entries()].map(([clave, t]) => <li key={clave} className="rounded-lg bg-stone-50 p-2 text-sm">
      {t.mayor && t.mayor !== t.tarea && <p className="text-xs text-stone-500">{t.mayor}</p>}
      <div className="flex items-start justify-between gap-2"><p className="min-w-0 break-words font-semibold">{t.tarea}</p><span className="shrink-0 font-semibold">{num(t.horas, 2)} h</span></div>
      {t.detalle && <p className="mt-1 whitespace-pre-wrap break-words text-stone-600">{t.detalle}</p>}
    </li>)}</ul>
    <p className="text-xs text-stone-500">Horas de personal sumadas por tarea y detalle.</p>
  </div>;
}
export default function Hoy() {
  const { fincas } = useAuth();
  const [dia, setDia] = useState(() => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    return iso(ayer);
  }), [grupo, setGrupo] = useState("");
  const { datos, error, cargando } = useCarga(async () => {
    const [partes, personal, tareas, ultimos] = await Promise.all([
      partesPeriodo(dia, dia),
      db.from("trabajadores").select("id,trabajadores_fincas(finca_id,activo)").eq("activo", true),
      db.from("tareas").select("id,titulo,finca_id,fecha").eq("completada", false).or(`fecha.lte.${dia},fecha.is.null`).order("fecha", { nullsFirst: false }).limit(500),
      Promise.all(fincas.map(async (f) => {
        const r = await db.from("partes_trabajo").select("finca_id,fecha").eq("finca_id", f.id).lte("fecha", dia).order("fecha", { ascending: false }).limit(1);
        if (r.error) throw new Error(r.error.message); return r.data?.[0];
      })),
    ]);
    for (const r of [personal, tareas]) if (r.error) throw new Error(r.error.message);
    if ((tareas.data?.length ?? 0) === 500) throw new Error("Hay demasiadas tareas pendientes para este resumen. Revísalas en el calendario.");
    return { partes, personal: personal.data ?? [], tareas: tareas.data ?? [], ultimos: ultimos.filter((p): p is NonNullable<typeof p> => !!p) };
  }, [dia, fincas.map((f) => f.id).join(",")]);
  const visibles = fincas.filter((f) => !grupo || grupoPersonal(f) === grupo);
  const avisos = avisosHoras((datos?.partes ?? []).filter((p) => visibles.some((f) => f.id === p.finca_id)));
  return <div className="mx-auto max-w-6xl space-y-4">
    <h1 className="text-xl font-semibold">Ayer en las fincas</h1>
    <div className="card grid gap-3 sm:grid-cols-2"><Field label="Día"><input type="date" className="input" max={iso(new Date())} value={dia} onChange={(e) => setDia(e.target.value)} /></Field><Field label="Grupo"><select className="input" value={grupo} onChange={(e) => setGrupo(e.target.value)}><option value="">Todos</option>{GRUPOS_PERSONAL.map((g) => <option key={g}>{g}</option>)}</select></Field></div>
    {error && <p role="alert" className="card text-red-700">{error}</p>}
    {cargando && <p role="status">Cargando resumen…</p>}
    {datos && !cargando && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visibles.map((f) => {
        const pp = datos.partes.filter((p) => p.finca_id === f.id), registrados = new Set(pp.map((p) => p.trabajador_id).filter(Boolean));
        const activos = datos.personal.filter((t) => t.trabajadores_fincas.some((a) => a.finca_id === f.id && a.activo));
        const pendientes = datos.tareas.filter((t) => t.finca_id === f.id);
        const ultimo = datos.ultimos.find((p) => p.finca_id === f.id)?.fecha;
        return <section key={f.id} className="card space-y-2"><p className="text-xs text-stone-500">{grupoPersonal(f)}</p><h2 className="font-bold">{f.nombre}</h2><p className="text-2xl font-bold text-brand-700">{num(pp.reduce((s, p) => s + Number(p.horas_totales), 0), 1)} h</p><p className="text-sm">{registrados.size} trabajadores con horas · {activos.length} activos actualmente</p><p className="text-sm">{pendientes.length} tareas pendientes hasta este día o sin fecha</p><p className="text-xs text-stone-500">Último registro: {ultimo ? fecha(ultimo) : "sin registros"}</p>{pp.length === 0 && <p className="text-sm text-amber-700">Sin registro este día</p>}{pp.length > 0 && <TrabajosRealizados partes={pp} />}<Link to="/horas" className="inline-block text-sm font-bold text-brand-700 underline">Registrar horas</Link></section>;
      })}</div>
      <p className="text-xs text-stone-600">Sin registro no significa ausencia. Las tareas mostradas dependen de los permisos del calendario de tu usuario.</p>
      {avisos.length > 0 && <section className="card"><h2 className="font-bold">Datos para revisar</h2><ul className="list-disc pl-5 text-sm">{avisos.map((a) => <li key={a}>{a}</li>)}</ul></section>}
      <section className="card"><h2 className="mb-2 font-bold">Tareas pendientes</h2>{datos.tareas.filter((t) => !t.finca_id || visibles.some((f) => f.id === t.finca_id)).map((t) => <p key={t.id} className="border-b border-stone-100 py-1 text-sm">{t.fecha ? fecha(t.fecha) : "Sin fecha"} · {t.titulo}</p>)}{!datos.tareas.length && <p className="text-sm text-stone-500">No hay tareas pendientes visibles.</p>}</section>
    </>}
  </div>;
}
