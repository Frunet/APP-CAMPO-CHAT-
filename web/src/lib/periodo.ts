export type Periodo = { desde: string; hasta: string; etiqueta: string };
const dmy = (s: string) => s.split("-").reverse().join("/");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
const finMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); // m = 1..12

export type Camp = { id: string; nombre: string; fecha_inicio: string; fecha_fin: string | null };

/** Periodo elegido (mes, trimestre, año, campaña o rango de fechas) a partir de los parámetros del filtro. */
export function leerPeriodo(sp: Record<string, string | undefined>, campanas: Camp[], hoy: string): { tipo: string; p: Periodo } {
  const tipo = ["mes", "trimestre", "anio", "campana", "rango"].includes(sp.tipo ?? "") ? sp.tipo! : "anio";
  const anio = /^\d{4}$/.test(sp.anio ?? "") ? Number(sp.anio) : Number(hoy.slice(0, 4));
  if (tipo === "mes") {
    const m = /^(\d{4})-(\d{2})$/.exec(sp.mes ?? "") ?? /^(\d{4})-(\d{2})$/.exec(hoy.slice(0, 7))!;
    const a = Number(m[1]), n = Math.min(12, Math.max(1, Number(m[2])));
    return { tipo, p: { desde: `${a}-${String(n).padStart(2, "0")}-01`, hasta: finMes(a, n), etiqueta: `${MESES[n - 1]} de ${a}` } };
  }
  if (tipo === "trimestre") {
    const q = Math.min(4, Math.max(1, Number(sp.trim) || Math.floor((Number(hoy.slice(5, 7)) - 1) / 3) + 1));
    return { tipo, p: { desde: `${anio}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`, hasta: finMes(anio, q * 3), etiqueta: `${q}.º trimestre de ${anio}` } };
  }
  if (tipo === "campana") {
    const c = campanas.find((x) => x.id === sp.campana) ?? campanas[0];
    if (c) return { tipo, p: { desde: c.fecha_inicio, hasta: c.fecha_fin ?? (hoy > c.fecha_inicio ? hoy : c.fecha_inicio), etiqueta: `campaña ${c.nombre}` } };
  }
  if (tipo === "rango") {
    const d = ok(sp.desde) ?? `${anio}-01-01`, h = ok(sp.hasta) ?? hoy;
    if (h >= d) return { tipo, p: { desde: d, hasta: h, etiqueta: `del ${dmy(d)} al ${dmy(h)}` } };
  }
  return { tipo: "anio", p: { desde: `${anio}-01-01`, hasta: `${anio}-12-31`, etiqueta: `año ${anio}` } };
}
