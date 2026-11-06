/** Agrupación solicitada para el maestro de personal; las demás fincas siguen visibles. */
export const GRUPOS_PERSONAL = ["PAI", "FRUNET", "LOMAS", "Otras fincas"] as const;
export type GrupoPersonal = typeof GRUPOS_PERSONAL[number];

export function normalizarPersonal(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
}

export function grupoPersonal(finca: { nombre?: string | null; codigo?: string | null }): GrupoPersonal {
  const etiquetas = [finca.nombre, finca.codigo].filter(Boolean).map((v) => normalizarPersonal(v!));
  if (etiquetas.some((v) => /^(pai)( |$)/.test(v) || /^(casa|fortaleza|avo casa|avo forta|avo fortaleza)$/.test(v))) return "PAI";
  if (etiquetas.some((v) => /^(frunet)( |$)/.test(v) || v === "rio velez")) return "FRUNET";
  if (etiquetas.some((v) => /^(loma|lomas)( |$)/.test(v) || v === "rio seco")) return "LOMAS";
  return "Otras fincas";
}
