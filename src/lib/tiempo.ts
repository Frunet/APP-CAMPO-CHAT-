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
