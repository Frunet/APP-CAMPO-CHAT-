export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const num = (n: number | null | undefined, dec = 0) =>
  n == null ? "—" : n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const eur = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
export const fecha = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("es-ES");

/** Lunes de la semana de d (semana lunes–domingo). */
export function lunes(d = new Date()) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export function periodos(hoy = new Date()) {
  const l = lunes(hoy);
  return {
    hoy: iso(hoy),
    semana: { desde: iso(l), hasta: iso(new Date(l.getTime() + 6 * 864e5)) },
    mes: { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) },
  };
}
