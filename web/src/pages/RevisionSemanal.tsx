import { useState } from "react";
import { useAuth } from "../auth";
import { db } from "../supabase";
import { Field, useCarga, msgError } from "../ui";
import { fecha, iso, num } from "../lib/format";
import { partesPeriodo } from "../lib/leer-operativa";
import { avisosHoras, clavePersona, fechasSemana, inicioSemana, nombreParte } from "../lib/operativa";
type Revision = { finca_id: string; revisado: boolean; cambiado: boolean; revisado_el: string | null; huella_actual: string };
export default function RevisionSemanal() {
  const { fincas, puedeGestionar } = useAuth();
  const [semana, setSemana] = useState(inicioSemana(iso(new Date()))), [finca, setFinca] = useState("");
  const [guardando, setGuardando] = useState(false), [mensaje, setMensaje] = useState("");
  const dias = fechasSemana(semana);
  const { datos, error, cargando, recargar } = useCarga(async () => {
    const r = await db.rpc("estado_revision_semana", { p_semana: semana });
    if (r.error) throw new Error(r.error.message);
    // La huella se lee antes del detalle: guardar rechazará cambios posteriores.
    const partes = await partesPeriodo(dias[0], dias[6]);
    const t = await db.from("trabajadores").select("id,codigo,nombre,trabajadores_fincas(finca_id,activo)").eq("activo", true).order("nombre");
    if (t.error) throw new Error(t.error.message);
    return { partes, revisiones: r.data as Revision[], trabajadores: t.data ?? [] };
  }, [semana]);
  const visibles = (datos?.partes ?? []).filter((p) => !finca || p.finca_id === finca);
  const personas = new Map<string, { nombre: string; codigo: string; dias: number[] }>();
  for (const t of datos?.trabajadores ?? []) if (t.trabajadores_fincas.some((a) => a.activo && (!finca || a.finca_id === finca))) personas.set(t.id, { nombre: t.nombre, codigo: t.codigo ?? "", dias: dias.map(() => 0) });
  for (const p of visibles) {
    const k = clavePersona(p), d = personas.get(k) ?? { nombre: nombreParte(p), codigo: p.trabajadores?.codigo ?? "", dias: dias.map(() => 0) };
    d.dias[dias.indexOf(p.fecha)] += Number(p.horas_totales); personas.set(k, d);
  }
  const avisos = avisosHoras(datos?.partes ?? []);
  async function revisar(id: string) {
    const r = datos?.revisiones.find((x) => x.finca_id === id);
    if (!r) return;
    setGuardando(true); setMensaje("");
    const result = await db.rpc("revisar_semana_horas", { p_finca: id, p_semana: semana, p_huella: r.huella_actual });
    setGuardando(false);
    if (result.error) setMensaje(msgError(result.error)); else { setMensaje("Semana marcada como revisada."); recargar(); }
  }
  return <div className="mx-auto max-w-6xl space-y-4">
    <h1 className="text-xl font-semibold">Revisión semanal</h1>
    <div className="card grid gap-3 sm:grid-cols-2"><Field label="Semana que contiene el día"><input className="input" type="date" max={iso(new Date())} value={semana} onChange={(e) => { if (e.target.value) { setSemana(inicioSemana(e.target.value)); setMensaje(""); } }} /></Field><Field label="Finca"><select className="input" value={finca} onChange={(e) => setFinca(e.target.value)}><option value="">Todas las fincas</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field></div>
    <p className="text-sm">Del {fecha(dias[0])} al {fecha(dias[6])}. «—» significa sin registro, no ausencia. Se incluyen los trabajadores activos actualmente y quienes tengan horas en el periodo.</p>
    {error && <p role="alert" className="card text-red-700">{error}</p>}{cargando && <p role="status">Cargando semana…</p>}
    {datos && !cargando && <>
      {avisos.length > 0 && <section className="card"><h2 className="font-bold">Revisar antes de cerrar</h2><ul className="list-disc pl-5 text-sm">{avisos.map((a) => <li key={a}>{a}</li>)}</ul></section>}
      <div className="card overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Trabajador</th>{dias.map((d, i) => <th key={d} className="th">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][i]} {fecha(d).slice(0, 5)}</th>)}<th className="th">Total</th></tr></thead><tbody>{[...personas].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es")).map(([id, p]) => <tr key={id}><td className="td">{p.codigo && <small>{p.codigo} · </small>}{p.nombre}</td>{p.dias.map((h, i) => <td key={i} className={`td text-right ${h > 12 ? "bg-amber-100 font-bold" : ""}`}>{h ? num(h, 1) : "—"}</td>)}<td className="td text-right font-bold">{num(p.dias.reduce((s, h) => s + h, 0), 1)}</td></tr>)}</tbody></table>{!personas.size && <p className="py-3 text-sm">No hay trabajadores ni horas para esta selección.</p>}</div>
      <section className="card space-y-3"><h2 className="font-bold">Estado de revisión por finca</h2><p className="text-xs text-stone-600">La marca no bloquea las correcciones. Si cambia cualquier parte o las horas de tractor, vuelve a quedar pendiente de revisar.</p>{fincas.filter((f) => !finca || f.id === finca).map((f) => {
        const r = datos.revisiones.find((x) => x.finca_id === f.id), hayHoras = datos.partes.some((p) => p.finca_id === f.id);
        return <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2"><span className="text-sm"><b>{f.nombre}</b> · {r?.revisado ? "Revisado" : r?.cambiado ? "Pendiente: las horas han cambiado" : "Pendiente de revisión"}{!hayHoras && " · sin horas de personal"}</span>{puedeGestionar && !r?.revisado && <button type="button" className="btn-ghost" disabled={guardando || !r} onClick={() => revisar(f.id)}>Marcar revisado</button>}</div>;
      })}{mensaje && <p role="status" className="text-sm">{mensaje}</p>}</section>
    </>}
  </div>;
}
