import { useState } from "react";
import { partesPeriodo } from "../lib/leer-operativa";
import { nombreParte } from "../lib/operativa";
import type { LineaImportacion } from "../lib/importacion-horas";
import { fecha } from "../lib/format";
import RevisionImportacion, { type TrabImportacion } from "./RevisionImportacion";
import type { ParteOperativo } from "../lib/operativa";
export default function RepetirDia({ finca, destino, trabajadores, cerrar, alGuardar }: { finca: { id: string; nombre: string }; destino: string; trabajadores: TrabImportacion[]; cerrar: () => void; alGuardar: () => void }) {
  const origen = new Date(new Date(`${destino}T12:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10);
  const [carga, setCarga] = useState<{ lineas: LineaImportacion[]; existentes: ParteOperativo[] } | null>(null), [error, setError] = useState("");
  async function cargar() {
    try {
      const [ayer, existentes] = await Promise.all([partesPeriodo(origen, origen, finca.id), partesPeriodo(destino, destino, finca.id)]);
      setCarga({ existentes, lineas: ayer.map((p) => ({ clave: p.id, archivo: "Repetición de partes", hoja: origen, fila: 0, fecha: destino, nombre: nombreParte(p), codigo: p.trabajadores?.codigo ?? "", finca: finca.nombre, mayor: p.mayor ?? "Otros", tipo_trabajo: p.tipo_trabajo ?? "Otros", actividad: p.actividad ?? "", horas: Number(p.horas_totales), extra: 0, error: Number(p.num_trabajadores ?? 1) !== 1 ? "El parte original agrupa varios trabajadores; introduce sus horas individualmente" : !p.trabajador_id ? "El parte original no tiene una ficha de trabajador" : !p.mayor ? "La tarea original no está clasificada" : "" })) });
    } catch (e) { setError((e as Error).message); }
  }
  return <div role="dialog" aria-modal="true" aria-label="Repetir el día anterior" className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3"><div className="mx-auto max-w-7xl space-y-3 rounded-2xl bg-white p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-bold">Repetir del {fecha(origen)} al {fecha(destino)} · {finca.nombre}</h2><button type="button" className="btn-ghost" onClick={cerrar}>Cerrar</button></div><p className="text-sm">Se preparan las horas para revisarlas. Las extras manuales se dejan a cero para que confirmes las del nuevo día. No se copian kilos de cosecha ni horas de tractor, y no se guarda nada hasta que confirmes.</p>{!carga && !error && <button type="button" className="btn" onClick={cargar}>Preparar partes para revisar</button>}{error && <p role="alert">{error}</p>}{carga && (carga.lineas.length ? <RevisionImportacion lineas={carga.lineas} existentes={carga.existentes} trabajadores={trabajadores} fincas={[finca]} alGuardar={alGuardar} /> : <p>No hay partes de personal el día anterior en esta finca.</p>)}</div></div>;
}
