export type ParteOperativo = { id: string; num_trabajadores?: number; fecha: string; finca_id: string; trabajador_id: string | null; trabajador_nombre: string | null; mayor: string | null; tipo_trabajo: string | null; actividad: string | null; horas_totales: number; horas_extra_totales: number; coste_total: number | null; trabajadores: { nombre: string; codigo: string | null } | null };
export const CONSULTA_PARTES_OPERATIVA = "id,num_trabajadores,fecha,finca_id,trabajador_id,trabajador_nombre,mayor,tipo_trabajo,actividad,horas_totales,horas_extra_totales,coste_total,trabajadores(codigo,nombre)";
export const nombreParte = (p: ParteOperativo) => p.trabajadores?.nombre ?? p.trabajador_nombre ?? "Sin trabajador identificado";
export const clavePersona = (p: ParteOperativo) => p.trabajador_id ?? `nombre:${p.trabajador_nombre ?? p.id}`;
export function fechasSemana(lunes: string): string[] {
  const inicio = new Date(`${lunes}T12:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => new Date(inicio.getTime() + i * 864e5).toISOString().slice(0, 10));
}
export function inicioSemana(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10);
}
export function avisosHoras(partes: ParteOperativo[]): string[] {
  const dias = new Map<string, { horas: number; nombre: string; fecha: string }>();
  const firmas = new Set<string>(), avisos = new Set<string>();
  for (const p of partes) {
    const k = `${clavePersona(p)}|${p.fecha}`, d = dias.get(k) ?? { horas: 0, nombre: nombreParte(p), fecha: p.fecha };
    d.horas += Number(p.horas_totales); dias.set(k, d);
    const firma = [p.fecha, p.finca_id, clavePersona(p), p.mayor, p.tipo_trabajo, p.actividad, Number(p.horas_totales)].join("|");
    if (firmas.has(firma)) avisos.add(`Posible duplicado: ${nombreParte(p)}, ${p.fecha}.`);
    firmas.add(firma);
    if (!p.mayor) avisos.add(`Tarea sin clasificar: ${nombreParte(p)}, ${p.fecha}.`);
  }
  for (const d of dias.values()) if (d.horas > 12) avisos.add(`${d.nombre}: ${d.horas} h el ${d.fecha}.`);
  return [...avisos];
}
export function costesPorTarea(partes: ParteOperativo[]) {
  const grupos = new Map<string, { tarea: string; horas: number; coste: number; sinTarifa: number; valorados: number }>();
  for (const p of partes) {
    const tarea = p.tipo_trabajo ?? p.mayor ?? "Sin clasificar", g = grupos.get(tarea) ?? { tarea, horas: 0, coste: 0, sinTarifa: 0, valorados: 0 };
    g.horas += Number(p.horas_totales);
    if (p.coste_total == null) g.sinTarifa++; else { g.coste += Number(p.coste_total); g.valorados++; }
    grupos.set(tarea, g);
  }
  return [...grupos.values()].sort((a, b) => b.horas - a.horas);
}
