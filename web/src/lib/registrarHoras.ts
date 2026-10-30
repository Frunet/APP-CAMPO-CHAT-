import { db } from "../supabase";
import { CAMPOS_HORAS, MAX_HORAS_DIA } from "./horas";
import { numero } from "./format";
import { msgError } from "../ui";

export type EntradaHoras = {
  finca_id: string; fecha: string; trabajadores: string[]; horas: string[]; extra: string; tractor: string; kg: string; variedad: string; actividad: string; forzar: boolean;
};
const dec = (v: string) => { const t = v.trim(); if (!t) return null; const x = Number(t.replace(",", ".")); return Number.isFinite(x) ? x : NaN; };
const es = (n: number) => n.toLocaleString("es-ES");

/**
 * Registro de horas (como el parte de AppCampo): varios trabajadores, una finca, una fecha y horas por tarea. Crea un parte por trabajador y tarea.
 * Avisa (y no guarda) si alguien pasaría de 12 h ese día, sumando lo ya registrado, salvo que se marque «registrar igualmente».
 * Devuelve el mensaje de resultado; lanza Error con el motivo si no se puede guardar.
 */
export async function registrarHoras(e: EntradaHoras): Promise<string> {
  const falla = (m: string): never => { throw new Error(m); };
  if (!e.finca_id) falla("Elige la finca");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha)) falla("Indica la fecha");
  const ids = e.trabajadores;
  const obs = e.actividad.trim().slice(0, 400) || null;
  const { data: vars } = await db.from("cultivos_maestro").select("id,cultivo,variedad").eq("activo", true);

  const lineas: { tarea: string; h: number; extra: number; actividad: string | null; kg?: number; cultivo?: string; variedad?: string | null }[] = [];
  CAMPOS_HORAS.forEach((c, i) => {
    const h = dec(e.horas[i] ?? "");
    if (h == null || h === 0) return;
    if (Number.isNaN(h) || h < 0 || h > 24) falla(`Horas no válidas en «${c.etiqueta}»`);
    const l: (typeof lineas)[number] = { tarea: c.tarea, h: h!, extra: 0, actividad: [c.subtipo, obs].filter(Boolean).join(" · ") || null };
    if (c.cosecha) {
      const kg = numero(e.kg);
      if (kg == null || kg <= 0 || kg > 10_000_000) falla("Indica los kg cosechados en Cosecha");
      const v = ((vars ?? []) as { id: string; cultivo: string; variedad: string | null }[]).find((x) => x.id === e.variedad);
      if (!v) falla("Elige la variedad cosechada (del maestro de cultivos)");
      Object.assign(l, { kg, cultivo: v!.cultivo, variedad: v!.variedad });
    }
    lineas.push(l);
  });

  // El tractor es del día y de la finca, no de las personas: un solo cajón de horas, sin trabajadores
  const tractor = dec(e.tractor) ?? 0;
  if (Number.isNaN(tractor) || tractor < 0 || tractor > 24) falla("Las horas de tractor deben estar entre 0 y 24");
  if (!lineas.length && !tractor) falla("Indica las horas de al menos una tarea o del tractor");
  if (lineas.length && !ids.length) falla("Elige al menos un trabajador");
  const nuevas = lineas.reduce((a, l) => a + l.h, 0);
  if (nuevas > 24) falla("Un trabajador no puede tener más de 24 h en un día");

  // Horas extra por trabajador (incluidas en el total): se reparten desde la última tarea hacia atrás
  const extraTotal = dec(e.extra) ?? 0;
  if (Number.isNaN(extraTotal) || extraTotal < 0) falla("Horas extra no válidas");
  if (extraTotal > nuevas) falla(`Las horas extra (${es(extraTotal)}) no pueden superar las horas totales (${es(nuevas)})`);
  let resto = extraTotal;
  for (const l of [...lineas].reverse()) { l.extra = Math.min(resto, l.h); resto = Math.round((resto - l.extra) * 100) / 100; }

  const { data: previos } = ids.length ? await db.from("partes_trabajo").select("trabajador_id,horas_por_trabajador,num_trabajadores").eq("fecha", e.fecha).in("trabajador_id", ids) : { data: [] };
  const ya = new Map<string, number>();
  for (const p of (previos ?? []) as { trabajador_id: string; horas_por_trabajador: number; num_trabajadores: number }[]) ya.set(p.trabajador_id, (ya.get(p.trabajador_id) ?? 0) + Number(p.horas_por_trabajador) * (Number(p.num_trabajadores) || 1));
  const pasan = ids.filter((id) => (ya.get(id) ?? 0) + nuevas > MAX_HORAS_DIA);
  if (pasan.length && !e.forzar) {
    const { data: nom } = await db.from("trabajadores").select("id,codigo,nombre").in("id", pasan);
    const det = ((nom ?? []) as { id: string; codigo: string | null; nombre: string }[]).map((t) => `${t.codigo ? t.codigo + " " : ""}${t.nombre} (${es((ya.get(t.id) ?? 0) + nuevas)} h)`).join(", ");
    falla(`Aviso: pasarían de ${MAX_HORAS_DIA} h ese día: ${det}. No se ha guardado nada; revisa las horas o marca «Registrar igualmente».`);
  }

  let hechos = 0, duplicados = 0;
  const fallos: string[] = [];
  for (const tid of ids) for (const l of lineas) {
    const { error } = await db.from("partes_trabajo").insert({
      fecha: e.fecha, finca_id: e.finca_id, trabajador_id: tid, num_trabajadores: 1, horas_por_trabajador: l.h, horas_extra_por_trabajador: l.extra, tipo_trabajo: l.tarea, actividad: l.actividad, origen: "manual",
    });
    if (!error) hechos++; else if (error.code === "23505") duplicados++; else if (fallos.length < 2) fallos.push(msgError(error));
  }

  // Cosecha: los kg son de la tarea (no de cada persona), así que se anota una sola cosecha por línea, salvo que ya exista igual
  let cosechas = 0;
  for (const l of lineas.filter((x) => x.kg)) {
    let q = db.from("cosechas").select("id").eq("fecha", e.fecha).eq("finca_id", e.finca_id).eq("cultivo", l.cultivo!).eq("kg", l.kg!);
    q = l.variedad ? q.eq("variedad", l.variedad) : q.is("variedad", null);
    const { data: ex } = await q.limit(1);
    if (ex?.length) continue;
    const { error } = await db.from("cosechas").insert({ fecha: e.fecha, finca_id: e.finca_id, cultivo: l.cultivo, variedad: l.variedad, kg: l.kg, origen: "manual" });
    if (!error) cosechas++; else if (fallos.length < 2) fallos.push(`cosecha: ${msgError(error)}`);
  }
  if (lineas.length && !hechos && !duplicados) falla(fallos[0] ?? "No se pudo guardar.");

  let tractorMsg = "";
  if (tractor > 0) {
    const { data: ex } = await db.from("horas_tractor").select("id,horas").eq("fecha", e.fecha).eq("finca_id", e.finca_id).maybeSingle();
    const { error } = ex
      ? await db.from("horas_tractor").update({ horas: tractor, observaciones: obs }).eq("id", ex.id)
      : await db.from("horas_tractor").insert({ fecha: e.fecha, finca_id: e.finca_id, horas: tractor, observaciones: obs });
    if (error) { if (!lineas.length) falla(msgError(error)); fallos.push(`tractor: ${msgError(error)}`); }
    else tractorMsg = ex ? `Tractor: ese día ya tenía ${es(Number(ex.horas))} h y se ha dejado en ${es(tractor)} h` : `Tractor: ${es(tractor)} h anotadas`;
  }
  return (lineas.length ? `${hechos} parte(s) guardado(s) para ${ids.length} trabajador(es)` : "") + (tractorMsg ? `${lineas.length ? "; " : ""}${tractorMsg}` : "") + (cosechas ? `; ${cosechas} cosecha(s) anotada(s)` : "") + (duplicados ? `; ${duplicados} ya existían` : "") + (fallos.length ? `; con errores: ${fallos.join(" | ")}` : "") + (pasan.length ? ` (aviso: ${pasan.length} pasan de ${MAX_HORAS_DIA} h)` : "") + ".";
}
