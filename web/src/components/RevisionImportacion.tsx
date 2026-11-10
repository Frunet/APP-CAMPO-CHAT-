import { useState } from "react";
import { db } from "../supabase";
import { num } from "../lib/format";
import { normalizarPersonal } from "../lib/grupos-personal";
import { activoEnFinca, type AsignacionFinca } from "../lib/personal-fincas";
import { nombreComparable, type LineaImportacion, TIPOS_IMPORTACION } from "../lib/importacion-horas";
import type { ParteOperativo } from "../lib/operativa";
export type TrabImportacion = { id: string; nombre: string; codigo: string | null; activo: boolean; trabajadores_fincas: AsignacionFinca[] };
type Finca = { id: string; nombre: string };
type RevisionFila = LineaImportacion & { trabajador_id: string; finca_id: string; seleccionada: boolean };
export default function RevisionImportacion({ lineas, trabajadores, fincas, existentes, alGuardar }: { lineas: LineaImportacion[]; trabajadores: TrabImportacion[]; fincas: Finca[]; existentes: ParteOperativo[]; alGuardar: () => void }) {
  const [filas, setFilas] = useState<RevisionFila[]>(() => lineas.map((l) => {
    const finca = fincas.find((f) => normalizarPersonal(f.nombre) === normalizarPersonal(l.finca) || ({ "avo casa": "casa", "avo forta": "fortaleza" } as Record<string, string>)[normalizarPersonal(l.finca)] === normalizarPersonal(f.nombre));
    const matches = trabajadores.filter((t) => l.codigo ? t.codigo === l.codigo : nombreComparable(t.nombre) === nombreComparable(l.nombre));
    const t = matches.length === 1 ? matches[0] : null;
    return { ...l, trabajador_id: t?.id ?? "", finca_id: finca?.id ?? "", seleccionada: !l.error && !!t && !!finca && activoEnFinca(t, finca.id) };
  }));
  const [forzar, setForzar] = useState(false), [guardando, setGuardando] = useState(false), [mensaje, setMensaje] = useState(""), [terminado, setTerminado] = useState(false);
  const firma = (r: RevisionFila) => [r.fecha, r.finca_id, r.trabajador_id, r.mayor, r.actividad.trim(), r.horas].join("|");
  const errorFila = (r: RevisionFila) => r.error || (!r.trabajador_id ? "Elige trabajador" : !r.finca_id ? "Elige finca" : !activoEnFinca(trabajadores.find((t) => t.id === r.trabajador_id)!, r.finca_id) ? "No está activo en esta finca" : !(r.horas > 0 && r.horas <= 24 && r.extra >= 0 && r.extra <= r.horas) ? "Revisa las horas" : "");
  const yaExiste = (r: RevisionFila) => existentes.some((p) => Number(p.num_trabajadores ?? 1) === 1 && p.fecha === r.fecha && p.finca_id === r.finca_id && p.trabajador_id === r.trabajador_id && p.mayor === r.mayor && Number(p.horas_totales) === r.horas && (!p.actividad?.trim() || p.actividad.trim() === r.actividad.trim())) || filas.some((p) => p.clave !== r.clave && filas.indexOf(p) < filas.indexOf(r) && firma(p) === firma(r));
  const elegidas = filas.filter((r) => r.seleccionada && !errorFila(r) && !yaExiste(r));
  const cambiar = (clave: string, cambios: Partial<RevisionFila>) => { setFilas((ff) => ff.map((r) => r.clave === clave ? { ...r, ...cambios } : r)); setMensaje(""); };
  async function guardar() {
    if (!elegidas.length || terminado || guardando) return;
    if (elegidas.length > 1000) { setMensaje("Selecciona como máximo 1000 líneas por importación."); return; }
    setGuardando(true); setMensaje("");
    const { data, error } = await db.rpc("importar_horas_revisadas", { p_forzar: forzar, p_filas: elegidas.map((r) => ({ fecha: r.fecha, finca_id: r.finca_id, trabajador_id: r.trabajador_id, horas_por_trabajador: r.horas, horas_extra_por_trabajador: r.extra, mayor: r.mayor, tipo_trabajo: r.tipo_trabajo, actividad: r.actividad, observaciones: `${r.archivo} · ${r.hoja}, fila ${r.fila}` })) });
    setGuardando(false);
    if (error) setMensaje(error.message); else { setTerminado(true); setMensaje(`${data.insertados} partes guardados, ${num(Number(data.horas_nuevas), 2)} h nuevas; ${data.duplicados} ya existían. El resto de filas no se ha importado.`); alGuardar(); }
  }
  return <section className="card space-y-3">
    <h2 className="font-bold">Revisar antes de guardar</h2><p className="text-sm">{filas.length} líneas · {elegidas.length} seleccionadas para importar · {num(elegidas.reduce((s, r) => s + r.horas, 0), 2)} h nuevas</p>
    <p className="text-xs text-stone-600">Las extras manuales están incluidas en las horas de cada fila. Se mantiene el mínimo automático al superar 7 h por trabajador y día entre todas las fincas, sin duplicarlas. Comprueba las coincidencias de nombres y las fincas. Las filas con errores o ya existentes quedan excluidas. El sistema vuelve a comprobarlas al guardar.</p>
    <div className="max-h-[55vh] overflow-auto"><table className="w-full"><thead className="sticky top-0"><tr>{["Importar", "Origen y fecha", "Trabajador", "Finca", "Tarea y detalle", "Horas", "Revisión"].map((h) => <th className="th" key={h}>{h}</th>)}</tr></thead><tbody>{filas.map((r) => {
      const err = errorFila(r), duplicado = yaExiste(r);
      return <tr key={r.clave}><td className="td"><input type="checkbox" aria-label={`Importar ${r.nombre} ${r.fecha} ${r.finca}`} checked={r.seleccionada && !err && !duplicado} disabled={terminado || !!err || duplicado} onChange={(e) => cambiar(r.clave, { seleccionada: e.target.checked })} /></td><td className="td min-w-36">{r.fecha || "Sin fecha"}<small className="block text-stone-500">{r.archivo} · {r.hoja}:{r.fila}</small></td><td className="td min-w-56"><small>{r.nombre}</small><select aria-label={`Trabajador fila ${r.clave}`} className="input" disabled={terminado} value={r.trabajador_id} onChange={(e) => cambiar(r.clave, { trabajador_id: e.target.value, seleccionada: true })}><option value="">Elige trabajador…</option>{trabajadores.map((t) => <option key={t.id} value={t.id}>{t.codigo ? `${t.codigo} · ` : ""}{t.nombre}</option>)}</select></td><td className="td min-w-48"><select aria-label={`Finca fila ${r.clave}`} className="input" disabled={terminado} value={r.finca_id} onChange={(e) => cambiar(r.clave, { finca_id: e.target.value, seleccionada: true })}><option value="">Elige finca…</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></td><td className="td min-w-56"><select aria-label={`Tarea fila ${r.clave}`} className="input" disabled={terminado} value={r.mayor} onChange={(e) => cambiar(r.clave, { mayor: e.target.value, tipo_trabajo: TIPOS_IMPORTACION[e.target.value] })}>{Object.keys(TIPOS_IMPORTACION).map((m) => <option key={m}>{m}</option>)}</select><input aria-label={`Detalle fila ${r.clave}`} className="input mt-1" disabled={terminado} maxLength={400} value={r.actividad} onChange={(e) => cambiar(r.clave, { actividad: e.target.value })} /></td><td className="td min-w-32"><input aria-label={`Horas fila ${r.clave}`} className="input" type="number" min="0.01" max="24" step="0.01" disabled={terminado} value={r.horas} onChange={(e) => cambiar(r.clave, { horas: Number(e.target.value) })} /><label className="mt-1 block text-xs">De ellas, extras manuales<input aria-label={`Extras manuales fila ${r.clave}`} type="number" min="0" max={r.horas} step="0.01" className="input" disabled={terminado} value={r.extra} onChange={e=>cambiar(r.clave,{extra:Number(e.target.value)})} /></label></td><td className="td text-sm">{err || (duplicado ? "Ya existe o está repetida en el archivo" : "Lista para revisar")}</td></tr>;
    })}</tbody></table></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={terminado} checked={forzar} onChange={(e) => setForzar(e.target.checked)} /> Confirmo las jornadas que superen 12 h, si las hubiera (máximo 24 h).</label>
    <button type="button" className="btn" disabled={guardando || terminado || !elegidas.length} onClick={guardar}>{guardando ? "Guardando…" : "Confirmar e importar seleccionadas"}</button>
    {mensaje && <p role="status" className="text-sm">{mensaje}</p>}
  </section>;
}
