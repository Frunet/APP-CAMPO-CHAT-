/** Tareas del registro de horas (las mismas columnas del parte de AppCampo). Se guardan tal cual en partes_trabajo.tipo_trabajo. */
export const TAREAS_HORAS = [
  "Instalaciones", "Suelos", "Liado y guía de planta", "Otros cuidados planta", "Riego, abonado y tratamiento", "Cosecha/ Recolección", "Otros",
] as const;
export const TAREAS_AYUDA: Record<string, string> = {
  "Instalaciones": "gomas riego, plásticos…", "Suelos": "arado, desbroce, hierbas…", "Otros cuidados planta": "tala, destalle…", "Riego, abonado y tratamiento": "sulfatos…",
};
export const MAX_HORAS_DIA = 12;
