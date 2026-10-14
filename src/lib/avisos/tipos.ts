export const TIPOS_REGLA: Record<string, { etiqueta: string; ayuda: string; params: Record<string, number | number[]> }> = {
  cosecha_proxima: { etiqueta: "Cosecha próxima", ayuda: "Avisa de cultivos con fecha de cosecha prevista en los próximos N días.", params: { dias: 7 } },
  falta_parte: { etiqueta: "Falta parte de trabajo", ayuda: "Avisa si no hay parte de un día laborable reciente.", params: { dias_atras: 2, dias_semana: [1, 2, 3, 4, 5, 6] } },
  falta_datos: { etiqueta: "Faltan datos de la semana", ayuda: "Revisa la semana anterior: sin partes o sin cosechas en fincas activas.", params: {} },
  doc_pendiente: { etiqueta: "Documentos pendientes de recibir", ayuda: "Documentos esperados cuya fecha ya ha llegado.", params: {} },
  gasto_sin_justificar: { etiqueta: "Gastos sin justificar", ayuda: "Gastos registrados sin documento tras N días.", params: { dias: 7 } },
  tarea_proxima: { etiqueta: "Tareas próximas o vencidas", ayuda: "Tareas y recordatorios a N días de su fecha o vencidos.", params: { dias: 2 } },
  objetivo_produccion: { etiqueta: "Objetivo de producción incumplido", ayuda: "Compara el periodo anterior con los objetivos definidos.", params: {} },
  anomalia: { etiqueta: "Valores anómalos", ayuda: "Registros recientes con valores inusuales (posibles errores).", params: {} },
  resumen_diario: { etiqueta: "Resumen diario", ayuda: "Resumen del día anterior con datos reales.", params: {} },
  resumen_semanal: { etiqueta: "Resumen semanal", ayuda: "Resumen de la semana anterior con datos reales.", params: {} },
};

export const REGLAS_BASE: { tipo: string; nombre: string; periodicidad: string; hora: string; prioridad: string; dia_semana?: number }[] = [
  { tipo: "cosecha_proxima", nombre: "Cosechas próximas", periodicidad: "diaria", hora: "08:00", prioridad: "alta" },
  { tipo: "falta_parte", nombre: "Falta parte de trabajo", periodicidad: "diaria", hora: "09:00", prioridad: "media" },
  { tipo: "tarea_proxima", nombre: "Tareas próximas", periodicidad: "diaria", hora: "08:00", prioridad: "media" },
  { tipo: "doc_pendiente", nombre: "Documentos pendientes", periodicidad: "semanal", hora: "09:00", prioridad: "media", dia_semana: 1 },
  { tipo: "gasto_sin_justificar", nombre: "Gastos sin justificar", periodicidad: "semanal", hora: "09:00", prioridad: "baja", dia_semana: 1 },
  { tipo: "falta_datos", nombre: "Datos semanales incompletos", periodicidad: "semanal", hora: "08:30", prioridad: "media", dia_semana: 1 },
  { tipo: "objetivo_produccion", nombre: "Objetivos de producción", periodicidad: "semanal", hora: "09:00", prioridad: "alta", dia_semana: 1 },
  { tipo: "anomalia", nombre: "Posibles errores de registro", periodicidad: "diaria", hora: "18:00", prioridad: "alta" },
  { tipo: "resumen_semanal", nombre: "Resumen semanal", periodicidad: "semanal", hora: "08:00", prioridad: "baja", dia_semana: 1 },
];
