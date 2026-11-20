/** Unifica nombres visibles sin cambiar códigos ni identificadores. */
export function nombreUnificado(valor: string): string {
  return valor.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-ES").replace(/(^|[\s\-’'])(\p{L})/gu, (_, separador: string, letra: string) => `${separador}${letra.toLocaleUpperCase("es-ES")}`);
}
