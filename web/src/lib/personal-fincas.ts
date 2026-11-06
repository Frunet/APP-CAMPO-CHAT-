export type AsignacionFinca = { finca_id: string; activo: boolean };
// Los nombres se obtienen del catálogo de fincas. Evita el enlace ambiguo
// entre la finca inicial del trabajador y sus nuevas asignaciones múltiples.
export const CONSULTA_PERSONAL = "*, trabajadores_fincas(finca_id,activo)";
export type PersonalConFincas = { activo?: boolean; trabajadores_fincas: AsignacionFinca[] };

export function fincasActivas(trabajador: PersonalConFincas): string[] {
  return trabajador.trabajadores_fincas.filter((a) => a.activo).map((a) => a.finca_id);
}

export function activoEnFinca(trabajador: PersonalConFincas, fincaId: string): boolean {
  return trabajador.activo !== false && fincasActivas(trabajador).includes(fincaId);
}

export function fincasEnVista(trabajador: PersonalConFincas, estado: string): string[] {
  return trabajador.trabajadores_fincas.filter((a) => !estado || (estado === "activo"
    ? trabajador.activo !== false && a.activo
    : trabajador.activo === false || !a.activo)).map((a) => a.finca_id);
}
