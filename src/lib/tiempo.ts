/** Fecha/hora local en una zona horaria (la del servidor suele ser UTC). */
export function ahoraLocal(tz = "Europe/Madrid", d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1; // 1 = lunes
  return {
    fecha: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute),
    dow, dia: Number(p.day),
  };
}

export const sumarDias = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dowDe = (iso: string) => ((new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7) + 1;
export const lunesDe = (iso: string) => sumarDias(iso, -(dowDe(iso) - 1));
export const hhmmAMin = (h: string) => { const [a, b] = h.split(":"); return Number(a) * 60 + Number(b || 0); };

/** Semanas (lunes) para elegir en un selector: la actual, la próxima y las siguientes. `extra` añade una semana ya asignada si queda fuera. */
export function opcionesSemanas(hoy: string, n = 12, extra?: string | null) {
  const f = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
  const nombre = (l: string, i?: number) =>
    `Semana del ${f(l)} al ${f(sumarDias(l, 6))}${i === 0 ? " (esta)" : i === 1 ? " (próxima)" : ""}`;
  const l0 = lunesDe(hoy);
  const out = Array.from({ length: n }, (_, i) => { const l = sumarDias(l0, 7 * i); return { v: l, label: nombre(l, i) }; });
  if (extra && !out.some((o) => o.v === extra)) out.unshift({ v: extra, label: nombre(extra) });
  return out;
}
