/**
 * Catálogo de tareas del registro de horas, agrupadas por «mayor» (control interno).
 * Cada tarea puede tener subtipos (un campo de horas por subtipo); Cosecha exige además kg y variedad (del maestro de cultivos).
 * Cada parte guarda su tarea en tipo_trabajo, el subtipo al principio de actividad («Maquinaria · texto libre») y su mayor en `mayor`.
 */
export type TareaDef = { nombre: string; subtipos?: readonly string[]; cosecha?: boolean };
export type MayorDef = { nombre: string; tareas: readonly TareaDef[] };

export const MAYORES: readonly MayorDef[] = [
  { nombre: "Instalaciones", tareas: [{ nombre: "Obra" }, { nombre: "Reparaciones", subtipos: ["Maquinaria", "Riego"] }] },
  { nombre: "Suelos", tareas: [{ nombre: "Hierba", subtipos: ["Desbrozadora", "Tractor"] }] },
  { nombre: "Liado y guiado", tareas: [] },
  { nombre: "Otros cuidados de planta", tareas: [{ nombre: "Poda" }, { nombre: "Aplicaciones foliares" }] },
  { nombre: "Riego", tareas: [{ nombre: "Riego" }] },
  { nombre: "Cosecha", tareas: [{ nombre: "Cosecha", cosecha: true }] },
  { nombre: "Otros", tareas: [{ nombre: "Otros" }] },
  { nombre: "Revisión finca", tareas: [{ nombre: "Revisión finca" }] },
];
export const NOMBRES_MAYOR = MAYORES.map((m) => m.nombre);
export const TAREAS_HORAS = MAYORES.flatMap((m) => m.tareas.map((t) => t.nombre));
export const MAX_HORAS_DIA = 12;

/** Un campo de horas por tarea (y por subtipo, si lo tiene). En este orden se numeran las horas del formulario. */
export type CampoHoras = { mayor: string; tarea: string; subtipo: string | null; etiqueta: string; cosecha: boolean };
export const CAMPOS_HORAS: readonly CampoHoras[] = MAYORES.flatMap((m) => m.tareas.flatMap((t): CampoHoras[] =>
  t.subtipos
    ? t.subtipos.map((s) => ({ mayor: m.nombre, tarea: t.nombre, subtipo: s, etiqueta: `${t.nombre} · ${s}`, cosecha: false }))
    : [{ mayor: m.nombre, tarea: t.nombre, subtipo: null, etiqueta: t.nombre, cosecha: !!t.cosecha }],
));
