/**
 * Tareas del registro de horas (lista fija). Cada una puede exigir un subtipo; Cosecha exige además kg y variedad (del maestro de cultivos).
 * La tarea se guarda en partes_trabajo.tipo_trabajo y el subtipo al principio de actividad («Desbrozadora · texto libre»).
 */
export type TareaDef = { nombre: string; subtipos?: readonly string[]; cosecha?: boolean };

export const TAREAS: readonly TareaDef[] = [
  { nombre: "Hierba", subtipos: ["Desbrozadora"] },
  { nombre: "Aplicaciones foliares" },
  { nombre: "Riego" },
  { nombre: "Reparaciones", subtipos: ["Maquinaria", "Riego"] },
  { nombre: "Poda" },
  { nombre: "Obra" },
  { nombre: "Cosecha", cosecha: true },
  { nombre: "Otros" },
];
export const TAREAS_HORAS = TAREAS.map((t) => t.nombre);
export const MAX_HORAS_DIA = 12;

/** Un campo de horas por tarea (y por subtipo, si lo tiene). En este orden se numeran h0, h1… en el formulario. */
export type CampoHoras = { tarea: string; subtipo: string | null; etiqueta: string; cosecha: boolean };
export const CAMPOS_HORAS: readonly CampoHoras[] = TAREAS.flatMap((t): CampoHoras[] =>
  t.subtipos
    ? t.subtipos.map((s) => ({ tarea: t.nombre, subtipo: s, etiqueta: `${t.nombre} · ${s}`, cosecha: false }))
    : [{ tarea: t.nombre, subtipo: null, etiqueta: t.nombre, cosecha: !!t.cosecha }],
);
