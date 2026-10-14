import type { SupabaseClient } from "@supabase/supabase-js";
import { ahoraLocal, dowDe, hhmmAMin, lunesDe, sumarDias } from "@/lib/tiempo";
import { CANALES, type AvisoSalida } from "./canales";

type Db = SupabaseClient;
type Regla = {
  id: string; tipo: string; nombre: string; finca_id: string | null; parametros: Record<string, any>; hora: string;
  periodicidad: string; prioridad: string; destinatarios: string[]; enviar_email: boolean; ultima_ejecucion: string | null;
  zona_horaria: string; dia_semana: number; dia_mes: number; created_at: string;
};
type Cand = { titulo: string; mensaje: string; finca_id: string | null; key: string; enlace?: string; forzados?: string[]; prioridad?: string };
type Perfil = { id: string; nombre: string; email: string | null; rol: string };
type Ctx = {
  db: Db; regla: Regla; hoy: string; fincas: { id: string; nombre: string }[];
  perfiles: Perfil[]; accesos: Map<string, Set<string>>;
};

const n0 = (x: number) => x.toLocaleString("es-ES", { maximumFractionDigits: 0 });
const n1 = (x: number) => x.toLocaleString("es-ES", { maximumFractionDigits: 1 });
const sum = (xs: any[], k: string) => xs.reduce((a, r) => a + Number(r[k] ?? 0), 0);
const fmt = (iso: string) => iso.split("-").reverse().join("/");

// ---------- generadores ----------
async function cosechaProxima({ db, regla, hoy, fincas }: Ctx): Promise<Cand[]> {
  const dias = Number(regla.parametros.dias ?? 7);
  const { data } = await db.from("cultivos_parcela")
    .select("id,cultivo,variedad,fecha_prevista_cosecha,parcelas!inner(codigo,finca_id)")
    .gte("fecha_prevista_cosecha", hoy).lte("fecha_prevista_cosecha", sumarDias(hoy, dias));
  const ids = new Set(fincas.map((f) => f.id));
  return (data ?? []).filter((c: any) => ids.has(c.parcelas.finca_id)).map((c: any) => {
    const faltan = Math.round((Date.parse(c.fecha_prevista_cosecha) - Date.parse(hoy)) / 864e5);
    return {
      titulo: `Cosecha próxima: ${c.cultivo}${c.variedad ? ` ${c.variedad}` : ""} · parcela ${c.parcelas.codigo}`,
      mensaje: `Prevista el ${fmt(c.fecha_prevista_cosecha)} (${faltan === 0 ? "hoy" : `en ${faltan} día(s)`}).`,
      finca_id: c.parcelas.finca_id, key: `cosecha:${c.id}:${c.fecha_prevista_cosecha}`, enlace: "/calendario",
    };
  });
}

async function faltaParte({ db, regla, hoy, fincas }: Ctx): Promise<Cand[]> {
  const atras = Number(regla.parametros.dias_atras ?? 2);
  const laborables: number[] = regla.parametros.dias_semana ?? [1, 2, 3, 4, 5, 6];
  const desdeRegla = regla.created_at.slice(0, 10); // no se revisa lo anterior a la creación de la regla
  const dias = Array.from({ length: atras }, (_, i) => sumarDias(hoy, -(i + 1)))
    .filter((d) => d >= desdeRegla && laborables.includes(dowDe(d)));
  if (!dias.length) return [];
  const out: Cand[] = [];
  for (const f of fincas) {
    const { count } = await db.from("parcelas").select("id", { count: "exact", head: true }).eq("finca_id", f.id).eq("estado", "activa");
    if (!count) continue;
    const { data } = await db.from("partes_trabajo").select("fecha").eq("finca_id", f.id).in("fecha", dias);
    const con = new Set((data ?? []).map((r: any) => r.fecha));
    for (const d of dias) if (!con.has(d))
      out.push({ titulo: `Falta el parte de trabajo del ${fmt(d)} · ${f.nombre}`, mensaje: "No hay ningún parte registrado ese día.", finca_id: f.id, key: `parte:${f.id}:${d}`, enlace: "/trabajo" });
  }
  return out;
}

async function faltaDatos({ db, hoy, fincas }: Ctx): Promise<Cand[]> {
  const ini = sumarDias(lunesDe(hoy), -7), fin = sumarDias(ini, 6), hace60 = sumarDias(hoy, -60);
  const out: Cand[] = [];
  for (const f of fincas) {
    const [r60, p, c] = await Promise.all([
      db.from("cosechas").select("id", { count: "exact", head: true }).eq("finca_id", f.id).gte("fecha", hace60),
      db.from("partes_trabajo").select("id", { count: "exact", head: true }).eq("finca_id", f.id).gte("fecha", ini).lte("fecha", fin),
      db.from("cosechas").select("id", { count: "exact", head: true }).eq("finca_id", f.id).gte("fecha", ini).lte("fecha", fin),
    ]);
    const p60 = await db.from("partes_trabajo").select("id", { count: "exact", head: true }).eq("finca_id", f.id).gte("fecha", hace60);
    if (!(r60.count ?? 0) && !(p60.count ?? 0)) continue; // finca sin actividad reciente: no molestar
    const faltan = [!p.count && "partes de trabajo", !c.count && "cosechas"].filter(Boolean);
    if (faltan.length) out.push({
      titulo: `Semana del ${fmt(ini)} incompleta · ${f.nombre}`,
      mensaje: `Sin ${faltan.join(" ni ")} registrados entre el ${fmt(ini)} y el ${fmt(fin)}.`,
      finca_id: f.id, key: `datos:${f.id}:${ini}`,
    });
  }
  return out;
}

async function docPendiente({ db, hoy, fincas }: Ctx): Promise<Cand[]> {
  const { data } = await db.from("documentos_esperados").select("id,descripcion,fecha_esperada,finca_id").is("documento_id", null);
  const ids = new Set(fincas.map((f) => f.id));
  const nombre = new Map(fincas.map((f) => [f.id, f.nombre]));
  return (data ?? []).filter((e: any) => ids.has(e.finca_id) && (!e.fecha_esperada || e.fecha_esperada <= hoy)).map((e: any) => ({
    titulo: `Documento pendiente de recibir · ${nombre.get(e.finca_id)}`,
    mensaje: `${e.descripcion}${e.fecha_esperada ? ` (esperado el ${fmt(e.fecha_esperada)})` : ""}`,
    finca_id: e.finca_id, key: `doc:${e.id}:${lunesDe(hoy)}`, enlace: "/chat",
  }));
}

async function gastoSinJustificar({ db, regla, hoy, fincas }: Ctx): Promise<Cand[]> {
  const limite = sumarDias(hoy, -Number(regla.parametros.dias ?? 7));
  const out: Cand[] = [];
  for (const f of fincas) {
    const { data } = await db.from("gastos").select("importe,moneda").eq("finca_id", f.id).eq("tipo_importe", "registrado").is("documento_id", null).lte("fecha", limite);
    if (!data?.length) continue;
    const monedas = [...new Set(data.map((g: any) => g.moneda))];
    out.push({
      titulo: `${data.length} gasto(s) sin justificar · ${f.nombre}`,
      mensaje: monedas.length === 1 ? `Total ${n0(sum(data, "importe"))} ${monedas[0]} sin documento adjunto.` : "Hay gastos sin documento adjunto.",
      finca_id: f.id, key: `gsj:${f.id}:${lunesDe(hoy)}`, enlace: "/gastos",
    });
  }
  return out;
}

async function tareaProxima({ db, regla, hoy, fincas }: Ctx): Promise<Cand[]> {
  const dias = Number(regla.parametros.dias ?? 2);
  const { data } = await db.from("tareas").select("id,titulo,fecha,finca_id,asignado_a,created_by")
    .eq("completada", false).lte("fecha", sumarDias(hoy, dias)).gte("fecha", sumarDias(hoy, -30));
  const ids = new Set(fincas.map((f) => f.id));
  return (data ?? []).filter((t: any) => !t.finca_id || ids.has(t.finca_id)).map((t: any) => ({
    titulo: `${t.fecha < hoy ? "Tarea vencida" : "Tarea próxima"}: ${t.titulo}`,
    mensaje: `Fecha prevista: ${fmt(t.fecha)}.`, finca_id: t.finca_id, key: `tarea:${t.id}:${t.fecha}`, enlace: "/calendario",
    forzados: [t.asignado_a ?? t.created_by].filter(Boolean),
    prioridad: t.fecha < hoy ? "alta" : undefined,
  }));
}

async function objetivoProduccion({ db, hoy, fincas }: Ctx): Promise<Cand[]> {
  const { data: objs } = await db.from("objetivos").select("id,finca_id,parcela_id,periodo,kg_objetivo,parcelas(codigo)").eq("activo", true);
  const ids = new Set(fincas.map((f) => f.id));
  const nombre = new Map(fincas.map((f) => [f.id, f.nombre]));
  const out: Cand[] = [];
  const mesPrev = (() => { const d = new Date(hoy + "T12:00:00Z"); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d; })();
  for (const o of ((objs ?? []) as any[]).filter((x) => ids.has(x.finca_id))) {
    let ini: string, fin: string, clave: string;
    if (o.periodo === "semanal") { ini = sumarDias(lunesDe(hoy), -7); fin = sumarDias(ini, 6); clave = ini; }
    else {
      ini = mesPrev.toISOString().slice(0, 10);
      fin = new Date(Date.UTC(mesPrev.getUTCFullYear(), mesPrev.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      clave = ini.slice(0, 7);
    }
    let q = db.from("cosechas").select("kg").eq("finca_id", o.finca_id).gte("fecha", ini).lte("fecha", fin);
    if (o.parcela_id) q = q.eq("parcela_id", o.parcela_id);
    const { data } = await q;
    const kg = sum(data ?? [], "kg");
    if (kg < Number(o.kg_objetivo)) out.push({
      titulo: `Objetivo ${o.periodo} no alcanzado · ${nombre.get(o.finca_id)}${o.parcelas ? ` · parcela ${o.parcelas.codigo}` : ""}`,
      mensaje: `Del ${fmt(ini)} al ${fmt(fin)}: ${n0(kg)} kg registrados frente a un objetivo de ${n0(Number(o.kg_objetivo))} kg (${n0((kg / Number(o.kg_objetivo)) * 100)} %).`,
      finca_id: o.finca_id, key: `obj:${o.id}:${clave}`, enlace: "/informes",
    });
  }
  return out;
}

const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function anomalia({ db, hoy, fincas }: Ctx): Promise<Cand[]> {
  const desde = new Date(Date.now() - 48 * 36e5).toISOString();
  const ids = fincas.map((f) => f.id);
  const nombre = new Map(fincas.map((f) => [f.id, f.nombre]));
  const out: Cand[] = [];
  const [{ data: partes }, { data: cosechas }] = await Promise.all([
    db.from("partes_trabajo").select("id,fecha,finca_id,horas_por_trabajador,num_trabajadores").in("finca_id", ids).gte("created_at", desde),
    db.from("cosechas").select("id,fecha,finca_id,parcela_id,kg,parcelas(codigo)").in("finca_id", ids).gte("created_at", desde),
  ]);
  for (const p of partes ?? []) if (Number(p.horas_por_trabajador) > 14)
    out.push({ titulo: `Horas inusuales en parte del ${fmt(p.fecha)} · ${nombre.get(p.finca_id)}`, mensaje: `${p.horas_por_trabajador} h por trabajador (${p.num_trabajadores} personas). ¿Error de registro?`, finca_id: p.finca_id, key: `anom:parte:${p.id}`, enlace: `/trabajo/${p.id}` });
  for (const c of cosechas ?? []) {
    const { data: hist } = await db.from("cosechas").select("kg").eq("parcela_id", c.parcela_id).neq("id", c.id).gte("fecha", sumarDias(hoy, -90));
    if ((hist?.length ?? 0) < 5) continue;
    const med = mediana(hist!.map((h: any) => Number(h.kg)));
    const kg = Number(c.kg);
    if (med > 0 && (kg > med * 3 || kg < med * 0.2))
      out.push({ titulo: `Cosecha atípica del ${fmt(c.fecha)} · parcela ${(c as any).parcelas?.codigo}`, mensaje: `${n0(kg)} kg frente a una mediana de ${n0(med)} kg en los últimos 90 días. Comprueba que no es un error.`, finca_id: c.finca_id, key: `anom:cosecha:${c.id}`, enlace: `/cosechas/${c.id}` });
  }
  return out;
}

/** Resúmenes: se generan por destinatario con SUS fincas; todas las cifras salen de la BD. */
async function resumen(ctx: Ctx, semanal: boolean): Promise<Cand[]> {
  const { db, hoy, fincas, perfiles, accesos, regla } = ctx;
  const ini = semanal ? sumarDias(lunesDe(hoy), -7) : sumarDias(hoy, -1);
  const fin = semanal ? sumarDias(ini, 6) : ini;
  const out: Cand[] = [];
  for (const u of destinatarios(ctx, null)) {
    const mias = fincas.filter((f) => u.rol === "administrador" || accesos.get(u.id)?.has(f.id));
    if (!mias.length) continue;
    const ids = mias.map((f) => f.id);
    const [{ data: c }, { data: p }] = await Promise.all([
      db.from("cosechas").select("kg,finca_id").in("finca_id", ids).gte("fecha", ini).lte("fecha", fin),
      db.from("partes_trabajo").select("horas_totales,coste_total,finca_id,fecha").in("finca_id", ids).gte("fecha", ini).lte("fecha", fin),
    ]);
    const lineas = mias.map((f) => {
      const cf = (c ?? []).filter((x: any) => x.finca_id === f.id), pf = (p ?? []).filter((x: any) => x.finca_id === f.id);
      const sinTarifa = pf.some((x: any) => x.coste_total == null);
      return `${f.nombre}: ${n0(sum(cf, "kg"))} kg · ${n1(sum(pf, "horas_totales"))} h · coste laboral ${n0(sum(pf, "coste_total"))} €${sinTarifa ? " (parcial: partes sin tarifa)" : ""}`;
    });
    out.push({
      titulo: `${semanal ? "Resumen semanal" : "Resumen diario"} (${fmt(ini)}${semanal ? ` – ${fmt(fin)}` : ""})`,
      mensaje: lineas.join("\n"), finca_id: null, key: `resumen:${regla.tipo}:${ini}`, forzados: [u.id], enlace: "/informes",
    });
  }
  return out;
}

const GENERADORES: Record<string, (c: Ctx) => Promise<Cand[]>> = {
  cosecha_proxima: cosechaProxima, falta_parte: faltaParte, falta_datos: faltaDatos, doc_pendiente: docPendiente,
  gasto_sin_justificar: gastoSinJustificar, tarea_proxima: tareaProxima, objetivo_produccion: objetivoProduccion,
  anomalia, resumen_diario: (c) => resumen(c, false), resumen_semanal: (c) => resumen(c, true),
};

// ---------- destinatarios ----------
function destinatarios({ regla, perfiles, accesos }: Ctx, fincaId: string | null): Perfil[] {
  const base = regla.destinatarios.length
    ? perfiles.filter((p) => regla.destinatarios.includes(p.id))
    : perfiles.filter((p) => p.rol === "administrador" || (p.rol === "responsable" && (!fincaId || accesos.get(p.id)?.has(fincaId))));
  // Nadie recibe avisos de fincas que no tiene autorizadas
  return base.filter((p) => !fincaId || p.rol === "administrador" || accesos.get(p.id)?.has(fincaId));
}

function debeEjecutar(r: Regla, ahora: Date) {
  const loc = ahoraLocal(r.zona_horaria, ahora);
  if (loc.minutos < hhmmAMin(r.hora)) return false;
  if (r.ultima_ejecucion && ahoraLocal(r.zona_horaria, new Date(r.ultima_ejecucion)).fecha === loc.fecha) return false;
  if (r.periodicidad === "semanal" && loc.dow !== r.dia_semana) return false;
  if (r.periodicidad === "mensual" && loc.dia !== r.dia_mes) return false;
  return true;
}

// ---------- ejecución ----------
export async function ejecutarAvisos(db: Db, ahora = new Date()) {
  const res = { reglas: 0, avisos_nuevos: 0, emails_enviados: 0, errores: [] as string[] };

  const [{ data: reglas }, { data: perfiles }, { data: uf }, { data: fincasAll }] = await Promise.all([
    db.from("avisos_reglas").select("*").eq("activa", true),
    db.from("profiles").select("id,nombre,email,rol").eq("activo", true),
    db.from("usuarios_fincas").select("user_id,finca_id"),
    db.from("fincas").select("id,nombre").eq("activa", true),
  ]);
  const accesos = new Map<string, Set<string>>();
  (uf ?? []).forEach((a: any) => accesos.set(a.user_id, (accesos.get(a.user_id) ?? new Set()).add(a.finca_id)));

  // Avisos pospuestos cuyo plazo venció vuelven a pendiente
  await db.from("avisos").update({ estado: "pendiente", pospuesto_hasta: null }).eq("estado", "pospuesto").lte("pospuesto_hasta", ahora.toISOString());

  for (const regla of (reglas ?? []) as Regla[]) {
    if (!debeEjecutar(regla, ahora)) continue;
    res.reglas++;
    try {
      const fincas = (fincasAll ?? []).filter((f: any) => !regla.finca_id || f.id === regla.finca_id);
      const ctx: Ctx = { db, regla, hoy: ahoraLocal(regla.zona_horaria, ahora).fecha, fincas, perfiles: (perfiles ?? []) as Perfil[], accesos };
      const gen = GENERADORES[regla.tipo];
      if (!gen) continue;
      const cands = await gen(ctx);
      const filas = cands.flatMap((c) => {
        const dest = c.forzados?.length
          ? ctx.perfiles.filter((p) => c.forzados!.includes(p.id) && (!c.finca_id || p.rol === "administrador" || accesos.get(p.id)?.has(c.finca_id)))
          : destinatarios(ctx, c.finca_id);
        return dest.map((d) => ({
          regla_id: regla.id, tipo: regla.tipo, titulo: c.titulo, mensaje: c.mensaje, prioridad: c.prioridad ?? regla.prioridad,
          finca_id: c.finca_id, destinatario_id: d.id, dedupe_key: c.key,
        }));
      });
      if (filas.length) {
        // La clave única (destinatario, dedupe_key) evita repetir el mismo aviso
        const { data, error } = await db.from("avisos").upsert(filas, { onConflict: "destinatario_id,dedupe_key", ignoreDuplicates: true }).select("id");
        if (error) throw error;
        res.avisos_nuevos += data?.length ?? 0;
      }
      await db.from("avisos_reglas").update({ ultima_ejecucion: ahora.toISOString() }).eq("id", regla.id);
    } catch (e: any) {
      res.errores.push(`${regla.nombre}: ${e?.message ?? e}`);
    }
  }

  // Envío por canales: se "reclama" cada aviso antes de enviar para no duplicar si se solapan ejecuciones
  const { data: pend } = await db.from("avisos").select("id,destinatario_id,titulo,mensaje,prioridad,avisos_reglas(enviar_email)")
    .is("email_enviado_at", null).eq("estado", "pendiente").order("created_at").limit(500);
  const porUsuario = new Map<string, any[]>();
  (pend ?? []).filter((a: any) => a.avisos_reglas?.enviar_email).forEach((a: any) => porUsuario.set(a.destinatario_id, [...(porUsuario.get(a.destinatario_id) ?? []), a]));
  for (const [uid, lista] of porUsuario) {
    const u = (perfiles ?? []).find((p: any) => p.id === uid);
    if (!u) continue;
    const ids = lista.map((a) => a.id);
    const { data: reclamados } = await db.from("avisos").update({ email_enviado_at: new Date().toISOString() }).in("id", ids).is("email_enviado_at", null).select("id");
    const mios = lista.filter((a) => reclamados?.some((r: any) => r.id === a.id)).slice(0, 25);
    if (!mios.length) continue;
    const salida: AvisoSalida[] = mios.map((a) => ({ id: a.id, titulo: a.titulo, mensaje: a.mensaje, prioridad: a.prioridad }));
    for (const canal of CANALES) {
      const r = await canal.enviar(u as Perfil, salida);
      const fallidos = ids.filter((i) => !r.entregados.includes(i) && mios.some((m) => m.id === i));
      if (fallidos.length) await db.from("avisos").update({ email_enviado_at: null }).in("id", fallidos); // se reintenta en la próxima ejecución
      if (r.error) res.errores.push(`${canal.nombre} → ${u.email ?? u.id}: ${r.error}`);
      res.emails_enviados += r.entregados.length;
    }
    // Los reclamados que no entraron en el lote de 25 vuelven a la cola
    const resto = (reclamados ?? []).map((r: any) => r.id).filter((i: string) => !mios.some((m) => m.id === i));
    if (resto.length) await db.from("avisos").update({ email_enviado_at: null }).in("id", resto);
  }
  return res;
}
