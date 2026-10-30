/**
 * Tareas del registro de horas (lista fija). Cada una puede exigir un subtipo; Cosecha exige además kg y variedad (del maestro de cultivos).
 * La tarea se guarda en partes_trabajo.tipo_trabajo y el subtipo al principio de actividad («Desbrozadora · texto libre»).
 */
export type TareaDef = { nombre: string; subtipos?: readonly string[]; cosecha?: boolean };

export const TAREAS: readonly TareaDef[] = [
  { nombre: "Hierba", subtipos: ["Desbrozadora", "Tractor"] },
  { nombre: "Aplicaciones foliares" },
  { nombre: "Riego" },
  { nombre: "Reparaciones", subtipos: ["Maquinaria", "Riego"] },
  { nombre: "Poda" },
  { nombre: "Obra" },
  { nombre: "Cosecha", cosecha: true },
];
export const TAREAS_HORAS = TAREAS.map((t) => t.nombre);
export const MAX_HORAS_DIA = 12;
