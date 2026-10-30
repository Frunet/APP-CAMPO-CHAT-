export const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const num = (n: number | null | undefined, dec = 0) =>
  n == null ? "—" : n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const eur = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
export const fecha = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("es-ES");

/** Números escritos a la española o inglesa: 5,627.00 / 5.627,00 / 1.250 (mil doscientos cincuenta) / 1250,5 */
export function numero(v: string | null | undefined): number | null {
  if (v == null) return null;
  let t = v.trim().replace(/\s/g, "");
  if (!t) return null;
  const c = t.lastIndexOf(","), p = t.lastIndexOf(".");
  if (c >= 0 && p >= 0) t = c > p ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (c >= 0) t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  else if (p >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
}

/** Lunes de la semana de d (semana lunes–domingo). */
export function lunes(d = new Date()) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
