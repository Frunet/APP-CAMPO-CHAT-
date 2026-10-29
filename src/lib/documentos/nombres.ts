/**
 * Coincidencia de nombres de trabajador entre una hoja de horas y Maestros → Personal.
 * Los nombres no se escriben igual («Jose Antonio Gutierrez Perez» / «3004 - GUTIERREZ PEREZ JOSE ANONIO»): se comparan como conjuntos de
 * palabras, sin acentos, sin códigos numéricos ni paréntesis, tolerando una errata de una letra. Solo se enlaza cuando hay UN candidato.
 */
const PALABRAS_SUELTAS = new Set(["frunet", "pai", "rio", "velez", "lomas"]);

const sinAcentos = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function palabras(nombre: unknown): string[] {
  return sinAcentos(String(nombre ?? "").replace(/\(.*?\)/g, " ")).toLowerCase().split(/[^a-z0-9]+/)
    .filter((p) => p && !/^\d+$/.test(p) && !PALABRAS_SUELTAS.has(p));
}

function distancia1(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}

const contiene = (grande: string[], p: string) => grande.some((q) => distancia1(p, q));
const subconjunto = (chico: string[], grande: string[]) => chico.length > 0 && chico.every((p) => contiene(grande, p));

/** El trabajador de la lista que corresponde a ese nombre, o null si no hay ninguno o hay varios posibles. */
export function buscarTrabajador<T extends { nombre: string }>(nombre: string, lista: T[]): T | null {
  const a = palabras(nombre);
  if (!a.length) return null;
  const iguales = lista.filter((t) => { const b = palabras(t.nombre); return subconjunto(a, b) && subconjunto(b, a); });
  if (iguales.length === 1) return iguales[0];
  if (iguales.length > 1) return null;
  const incluidos = lista.filter((t) => {
    const b = palabras(t.nombre);
    return (a.length >= 2 && subconjunto(a, b)) || (b.length >= 2 && subconjunto(b, a));
  });
  return incluidos.length === 1 ? incluidos[0] : null;
}
