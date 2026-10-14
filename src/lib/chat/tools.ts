import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rendimientoKgHora } from "@/lib/informes";

type Db = SupabaseClient;
type Ctx = { db: Db; userId: string; conversacionId: string };

const ROW_CAP = 5000;
const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((a, b) => a + (Number(b) || 0), 0);
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// ---------- Definición de herramientas para la API ----------
const rango = {
  desde: { type: "string", description: "Fecha inicial YYYY-MM-DD (incluida)" },
  hasta: { type: "string", description: "Fecha final YYYY-MM-DD (incluida)" },
  finca: { type: "string", description: "Código o nombre de la finca (opcional)" },
  parcela: { type: "string", description: "Código o nombre de la parcela (opcional)" },
};

export const tools: Anthropic.Tool[] = [
  {
    name: "listar_fincas_parcelas",
    description: "Lista las fincas y parcelas a las que el usuario tiene acceso, con cultivos activos.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "consultar_cosechas",
    description:
      "Devuelve kg cosechados reales (de la base de datos) agregados en el periodo, por parcela, variedad y día, " +
      "más kg por trabajador-hora si hay horas registradas en las mismas parcelas y fechas.",
    input_schema: { type: "object", properties: rango, required: ["desde", "hasta"] },
  },
  {
    name: "consultar_mano_obra",
    description: "Devuelve horas totales, nº de partes y coste de mano de obra reales en el periodo, por parcela y día.",
    input_schema: { type: "object", properties: rango, required: ["desde", "hasta"] },
  },
  {
    name: "consultar_gastos",
    description:
      "Devuelve gastos del periodo por categoría. Distingue importes 'registrado' de presupuestos/estimaciones/previsiones. " +
      "Incluye coste por hectárea si hay superficie.",
    input_schema: { type: "object", properties: rango, required: ["desde", "hasta"] },
  },
  {
    name: "listar_pendientes",
    description: "Devuelve avisos sin resolver, tareas próximas y días recientes sin parte de trabajo registrado.",
    input_schema: { type: "object", properties: { dias: { type: "number", description: "Días hacia atrás/adelante (def. 7)" } } },
  },
  {
    name: "buscar_documentos",
    description: "Busca documentos subidos por texto (nombre o contenido), tipo y fechas del documento. Devuelve nombre, tipo, estado y enlace.",
    input_schema: {
      type: "object",
      properties: { texto: { type: "string" }, tipo: { type: "string" }, desde: { type: "string" }, hasta: { type: "string" }, finca: { type: "string" } },
    },
  },
  {
    name: "documentos_pendientes",
    description: "Lista los documentos esperados que aún no se han recibido (p. ej. de fincas externas) y los gastos sin documento justificativo.",
    input_schema: { type: "object", properties: { finca: { type: "string" } } },
  },
  {
    name: "proponer_parte_trabajo",
    description:
      "Prepara (NO guarda) un parte de trabajo. El usuario debe confirmarlo en pantalla. " +
      "Si faltan finca, parcela, nº de trabajadores u horas, pregunta antes de llamar.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string" }, finca: { type: "string" }, parcela: { type: "string" },
        num_trabajadores: { type: "number" }, horas_por_trabajador: { type: "number" },
        hora_entrada: { type: "string", description: "HH:MM" }, hora_salida: { type: "string", description: "HH:MM" },
        tipo_trabajo: { type: "string" }, actividad: { type: "string" },
        coste_hora: { type: "number" }, observaciones: { type: "string" },
      },
      required: ["fecha", "finca", "num_trabajadores", "horas_por_trabajador"],
    },
  },
  {
    name: "proponer_cosecha",
    description: "Prepara (NO guarda) un registro de cosecha para confirmación del usuario.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string" }, finca: { type: "string" }, parcela: { type: "string" },
        cultivo: { type: "string" }, variedad: { type: "string" }, kg: { type: "number" },
        cajas: { type: "number" }, calibre: { type: "string" }, calidad: { type: "string" },
        destino: { type: "string" }, observaciones: { type: "string" },
      },
      required: ["fecha", "finca", "parcela", "cultivo", "kg"],
    },
  },
  {
    name: "proponer_gasto",
    description: "Prepara (NO guarda) un gasto para confirmación del usuario.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string" }, finca: { type: "string" }, parcela: { type: "string" },
        categoria: {
          type: "string",
          enum: ["mano_obra", "insumos", "maquinaria", "combustible", "semillas_plantas", "riego_agua", "herramientas", "transporte", "otros"],
        },
        proveedor: { type: "string" }, concepto: { type: "string" }, importe: { type: "number" },
        moneda: { type: "string" },
        tipo_importe: { type: "string", enum: ["registrado", "presupuesto", "estimacion", "prevision"] },
      },
      required: ["fecha", "finca", "categoria", "importe"],
    },
  },
  {
    name: "proponer_tarea",
    description: "Prepara (NO guarda) una tarea o recordatorio (p. ej. próxima recolección) para confirmación.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" }, fecha: { type: "string" }, finca: { type: "string" },
        parcela: { type: "string" }, tipo: { type: "string" }, descripcion: { type: "string" },
      },
      required: ["titulo", "fecha"],
    },
  },
];

// ---------- Resolución de finca / parcela ----------
type Ref = { finca_id?: string; parcela_id?: string; finca?: string; parcela?: string; sup_ha?: number | null };

async function resolver(db: Db, fincaTxt?: string, parcelaTxt?: string): Promise<Ref | { error: string }> {
  const out: Ref = {};
  if (fincaTxt) {
    const { data } = await db.from("fincas").select("id,codigo,nombre,superficie_ha").eq("activa", true);
    const q = fincaTxt.trim().toLowerCase();
    const m = (data ?? []).filter((f) => f.codigo.toLowerCase() === q || f.nombre.toLowerCase().includes(q));
    if (m.length === 0) return { error: `No existe ninguna finca autorizada que coincida con «${fincaTxt}».` };
    if (m.length > 1) return { error: `«${fincaTxt}» es ambiguo: ${m.map((f) => f.nombre).join(", ")}. Pregunta cuál.` };
    out.finca_id = m[0].id; out.finca = m[0].nombre; out.sup_ha = m[0].superficie_ha;
  }
  if (parcelaTxt) {
    let qb = db.from("parcelas").select("id,codigo,nombre,finca_id,superficie_ha");
    if (out.finca_id) qb = qb.eq("finca_id", out.finca_id);
    const { data } = await qb;
    const q = parcelaTxt.trim().toLowerCase().replace(/^parcela\s*/, "");
    const m = (data ?? []).filter((p) => p.codigo.toLowerCase() === q || (p.nombre ?? "").toLowerCase().includes(q));
    if (m.length === 0) return { error: `No existe la parcela «${parcelaTxt}»${out.finca ? ` en ${out.finca}` : ""}.` };
    if (m.length > 1) return { error: `«${parcelaTxt}» existe en varias fincas; indica la finca.` };
    out.parcela_id = m[0].id; out.parcela = m[0].nombre ?? m[0].codigo; out.finca_id = m[0].finca_id;
    out.sup_ha = m[0].superficie_ha;
  }
  return out;
}
const esError = (r: Ref | { error: string }): r is { error: string } => "error" in r;

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD");

// ---------- Ejecución ----------
export async function ejecutarHerramienta(name: string, input: any, ctx: Ctx): Promise<unknown> {
  const { db } = ctx;
  try {
    switch (name) {
      case "listar_fincas_parcelas": {
        const { data } = await db
          .from("fincas")
          .select("codigo,nombre,tipo_explotacion,superficie_ha,parcelas(codigo,nombre,superficie_ha,estado,cultivos_parcela(cultivo,variedad,fecha_prevista_cosecha))")
          .eq("activa", true);
        return data ?? [];
      }
      case "consultar_cosechas": {
        const p = z.object({ desde: fecha, hasta: fecha }).parse(input);
        const ref = await resolver(db, input.finca, input.parcela);
        if (esError(ref)) return ref;
        let q = db.from("cosechas").select("fecha,kg,variedad,cultivo,parcela_id,finca_id,parcelas(codigo)").gte("fecha", p.desde).lte("fecha", p.hasta).limit(ROW_CAP);
        if (ref.finca_id) q = q.eq("finca_id", ref.finca_id);
        if (ref.parcela_id) q = q.eq("parcela_id", ref.parcela_id);
        const { data, error } = await q;
        if (error) return { error: error.message };
        const rows = (data ?? []) as any[];
        const agg = (key: (r: any) => string) => {
          const m: Record<string, number> = {};
          rows.forEach((r) => (m[key(r)] = (m[key(r)] ?? 0) + Number(r.kg)));
          return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round(v)]));
        };
        // kg/hora solo con días-parcela que tienen cosecha Y parte con horas (no se mezclan otras labores)
        let qh = db.from("partes_trabajo").select("fecha,horas_totales,parcela_id").gte("fecha", p.desde).lte("fecha", p.hasta).limit(ROW_CAP);
        if (ref.finca_id) qh = qh.eq("finca_id", ref.finca_id);
        if (ref.parcela_id) qh = qh.eq("parcela_id", ref.parcela_id);
        const { data: horas } = await qh;
        const rend = rendimientoKgHora(rows as any[], (horas ?? []) as any[]);
        const kgPorHora = rend?.valor ?? null;
        const nota_rendimiento = rend
          ? `Calculado con ${rend.pares} día(s)-parcela que tienen cosecha y horas (${rend.kg} kg / ${rend.horas} h).`
          : "No hay días con cosecha y horas en la misma parcela: no se calcula kg por trabajador-hora.";
        return {
          periodo: `${p.desde} a ${p.hasta}`, registros: rows.length, kg_total: round(sum(rows.map((r) => r.kg))),
          por_parcela: agg((r) => r.parcelas?.codigo ?? "?"), por_variedad: agg((r) => r.variedad ?? "sin variedad"),
          por_dia: agg((r) => r.fecha), kg_por_trabajador_hora: kgPorHora, nota_rendimiento,
          truncado: rows.length >= ROW_CAP,
        };
      }
      case "consultar_mano_obra": {
        const p = z.object({ desde: fecha, hasta: fecha }).parse(input);
        const ref = await resolver(db, input.finca, input.parcela);
        if (esError(ref)) return ref;
        let q = db.from("partes_trabajo").select("fecha,horas_totales,coste_total,num_trabajadores,parcelas(codigo)").gte("fecha", p.desde).lte("fecha", p.hasta).limit(ROW_CAP);
        if (ref.finca_id) q = q.eq("finca_id", ref.finca_id);
        if (ref.parcela_id) q = q.eq("parcela_id", ref.parcela_id);
        const { data, error } = await q;
        if (error) return { error: error.message };
        const rows = (data ?? []) as any[];
        const sinTarifa = rows.filter((r) => r.coste_total == null).length;
        const por = (key: (r: any) => string) => {
          const m: Record<string, number> = {};
          rows.forEach((r) => (m[key(r)] = (m[key(r)] ?? 0) + Number(r.horas_totales)));
          return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round(v)]));
        };
        return {
          periodo: `${p.desde} a ${p.hasta}`, partes: rows.length, horas_totales: round(sum(rows.map((r) => r.horas_totales))),
          coste_total_eur: round(sum(rows.map((r) => r.coste_total))),
          aviso_coste: sinTarifa ? `${sinTarifa} parte(s) sin tarifa: el coste es parcial.` : null,
          por_parcela: por((r) => r.parcelas?.codigo ?? "sin parcela"), por_dia: por((r) => r.fecha),
        };
      }
      case "consultar_gastos": {
        const p = z.object({ desde: fecha, hasta: fecha }).parse(input);
        const ref = await resolver(db, input.finca, input.parcela);
        if (esError(ref)) return ref;
        let q = db.from("gastos").select("categoria,importe,moneda,tipo_importe").gte("fecha", p.desde).lte("fecha", p.hasta).limit(ROW_CAP);
        if (ref.finca_id) q = q.eq("finca_id", ref.finca_id);
        if (ref.parcela_id) q = q.eq("parcela_id", ref.parcela_id);
        const { data, error } = await q;
        if (error) return { error: error.message };
        const rows = (data ?? []) as any[];
        const reg = rows.filter((r) => r.tipo_importe === "registrado");
        const porCat: Record<string, number> = {};
        reg.forEach((r) => (porCat[r.categoria] = (porCat[r.categoria] ?? 0) + Number(r.importe)));
        const total = sum(reg.map((r) => r.importe));
        return {
          periodo: `${p.desde} a ${p.hasta}`,
          total_registrado: round(total), por_categoria: porCat,
          monedas: [...new Set(rows.map((r) => r.moneda))],
          no_contabilizado: { // presupuestos/estimaciones/previsiones NO se suman a los costes reales
            registros: rows.length - reg.length,
            importe: round(sum(rows.filter((r) => r.tipo_importe !== "registrado").map((r) => r.importe))),
          },
          coste_por_ha: ref.sup_ha ? round(total / Number(ref.sup_ha)) : null,
          nota_coste_ha: ref.sup_ha ? undefined : "Indica una finca/parcela con superficie para calcular coste por hectárea.",
        };
      }
      case "listar_pendientes": {
        const dias = Number(input?.dias ?? 7);
        const hoy = new Date();
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        const desde = new Date(hoy.getTime() - dias * 864e5);
        const hasta = new Date(hoy.getTime() + dias * 864e5);
        const [avisos, tareas, partes, acciones] = await Promise.all([
          db.from("avisos").select("titulo,prioridad,estado").in("estado", ["pendiente", "pospuesto"]).limit(50),
          db.from("tareas").select("titulo,fecha,tipo").eq("completada", false).lte("fecha", iso(hasta)).order("fecha").limit(50),
          db.from("partes_trabajo").select("fecha").gte("fecha", iso(desde)).lte("fecha", iso(hoy)),
          db.from("acciones_pendientes").select("resumen,created_at").eq("estado", "pendiente"),
        ]);
        const conParte = new Set((partes.data ?? []).map((x: any) => x.fecha));
        const sinParte: string[] = [];
        for (let d = new Date(desde); d <= hoy; d = new Date(d.getTime() + 864e5)) if (!conParte.has(iso(d))) sinParte.push(iso(d));
        return { avisos: avisos.data, tareas: tareas.data, dias_sin_parte: sinParte, acciones_sin_confirmar: acciones.data };
      }
      case "buscar_documentos": {
        const ref = await resolver(db, input?.finca);
        if (esError(ref)) return ref;
        let q = db.from("documentos").select("id,nombre,tipo,estado,fecha_documento,fincas(nombre)").order("created_at", { ascending: false }).limit(20);
        if (ref.finca_id) q = q.eq("finca_id", ref.finca_id);
        if (input?.tipo) q = q.eq("tipo", String(input.tipo));
        if (input?.desde) q = q.gte("fecha_documento", fecha.parse(input.desde));
        if (input?.hasta) q = q.lte("fecha_documento", fecha.parse(input.hasta));
        const t = String(input?.texto ?? "").replace(/[%*,()\\]/g, " ").trim();
        if (t) q = q.or(`nombre.ilike.%${t}%,texto_extraido.ilike.%${t}%`);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { encontrados: (data ?? []).map((d: any) => ({ nombre: d.nombre, tipo: d.tipo, estado: d.estado, fecha_documento: d.fecha_documento, finca: d.fincas?.nombre, enlace: `/documentos/${d.id}` })) };
      }
      case "documentos_pendientes": {
        const ref = await resolver(db, input?.finca);
        if (esError(ref)) return ref;
        let e = db.from("documentos_esperados").select("descripcion,tipo,fecha_esperada,fincas(nombre)").is("documento_id", null).order("fecha_esperada");
        let g = db.from("gastos").select("fecha,importe,moneda,categoria,proveedor,fincas(nombre)").is("documento_id", null).eq("tipo_importe", "registrado").order("fecha", { ascending: false }).limit(50);
        if (ref.finca_id) { e = e.eq("finca_id", ref.finca_id); g = g.eq("finca_id", ref.finca_id); }
        const [esp, gas] = await Promise.all([e, g]);
        return { documentos_esperados_sin_recibir: esp.data ?? [], gastos_sin_justificar: gas.data ?? [], fecha_hoy: new Date().toISOString().slice(0, 10) };
      }
      case "proponer_parte_trabajo":
      case "proponer_cosecha":
      case "proponer_gasto":
      case "proponer_tarea":
        return await proponer(name, input, ctx);
      default:
        return { error: `Herramienta desconocida: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : String(e) };
  }
}

// ---------- Propuestas (requieren confirmación humana) ----------
async function proponer(name: string, i: any, ctx: Ctx) {
  const ref = await resolver(ctx.db, i.finca, i.parcela);
  if (esError(ref)) return ref;
  if (name !== "proponer_tarea" && !ref.finca_id) return { error: "Falta la finca. Pregunta al usuario." };
  if ((name === "proponer_cosecha") && !ref.parcela_id) return { error: "Falta la parcela. Pregunta al usuario." };
  fecha.parse(i.fecha);

  let tipo: string, payload: Record<string, unknown>, resumen: string;
  const lugar = `${ref.finca ?? "—"}${ref.parcela ? ` · parcela ${ref.parcela}` : ""}`;
  if (name === "proponer_parte_trabajo") {
    const total = round(Number(i.num_trabajadores) * Number(i.horas_por_trabajador));
    tipo = "registrar_parte";
    payload = {
      fecha: i.fecha, finca_id: ref.finca_id, parcela_id: ref.parcela_id ?? null,
      num_trabajadores: i.num_trabajadores, horas_por_trabajador: i.horas_por_trabajador,
      hora_entrada: i.hora_entrada ?? null, hora_salida: i.hora_salida ?? null,
      tipo_trabajo: i.tipo_trabajo ?? null, actividad: i.actividad ?? null,
      coste_hora: i.coste_hora ?? null, observaciones: i.observaciones ?? null, origen: "chat",
    };
    resumen = `Parte de trabajo · ${i.fecha} · ${lugar}\n${i.num_trabajadores} trabajadores × ${i.horas_por_trabajador} h = ${total} h` +
      (i.actividad ? `\nActividad: ${i.actividad}` : "") + (i.coste_hora ? `\nCoste estimado: ${round(total * i.coste_hora)} €` : "\nCoste: se calculará si hay tarifa configurada");
  } else if (name === "proponer_cosecha") {
    tipo = "registrar_cosecha";
    payload = {
      fecha: i.fecha, finca_id: ref.finca_id, parcela_id: ref.parcela_id, cultivo: i.cultivo,
      variedad: i.variedad ?? null, kg: i.kg, cajas: i.cajas ?? null, calibre: i.calibre ?? null,
      calidad: i.calidad ?? null, destino: i.destino ?? null, observaciones: i.observaciones ?? null, origen: "chat",
    };
    resumen = `Cosecha · ${i.fecha} · ${lugar}\n${i.cultivo}${i.variedad ? ` ${i.variedad}` : ""}: ${i.kg} kg` +
      (i.cajas ? ` (${i.cajas} cajas)` : "") + (i.calidad ? `\nCalidad: ${i.calidad}` : "") + (i.destino ? `\nDestino: ${i.destino}` : "");
  } else if (name === "proponer_gasto") {
    tipo = "registrar_gasto";
    payload = {
      fecha: i.fecha, finca_id: ref.finca_id, parcela_id: ref.parcela_id ?? null, categoria: i.categoria,
      proveedor: i.proveedor ?? null, concepto: i.concepto ?? null, importe: i.importe,
      moneda: i.moneda ?? "EUR", tipo_importe: i.tipo_importe ?? "registrado",
    };
    resumen = `Gasto (${payload.tipo_importe}) · ${i.fecha} · ${lugar}\n${i.categoria}: ${i.importe} ${payload.moneda}` +
      (i.proveedor ? `\nProveedor: ${i.proveedor}` : "");
  } else {
    tipo = "crear_tarea";
    payload = {
      titulo: i.titulo, fecha: i.fecha, finca_id: ref.finca_id ?? null, parcela_id: ref.parcela_id ?? null,
      tipo: i.tipo ?? "recordatorio", descripcion: i.descripcion ?? null, origen: "chat",
    };
    resumen = `Tarea · ${i.fecha}${ref.finca ? ` · ${lugar}` : ""}\n${i.titulo}`;
  }

  const { data, error } = await ctx.db
    .from("acciones_pendientes")
    .insert({ conversacion_id: ctx.conversacionId, user_id: ctx.userId, tipo, payload, resumen })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return {
    accion_id: data.id, resumen,
    instruccion: "Propuesta creada y NO guardada todavía. Presenta el resumen y di que debe confirmarla con el botón. No afirmes que está registrada.",
  };
}
