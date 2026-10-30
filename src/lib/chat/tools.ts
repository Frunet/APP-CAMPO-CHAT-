import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { lunesDe } from "@/lib/tiempo";
import { esError, resolver, resolverPersonal, type Ref } from "./resolver";
import { herramientasMaestros, proponerMaestro } from "./maestros";
import { buscarDiario, herramientasDiario, proponerNovedad, proponerRetirarNovedad } from "./diario";
import { herramientasMemoria, proponerMemoria, proponerOlvidarMemoria } from "./memoria";
import { consultarCostesGenerales, herramientasCostes } from "./costes";
import { herramientasDescargas, prepararDescarga } from "./descargas";
import { consultarMaestros, consultarProduccionAnual, herramientasConsultas, herramientasProduccion } from "./consultas";
import { buscarTareas, herramientasTareas, proponerAsignacionTarea, proponerCompletarTarea } from "./tareas";
import { buscarDocumentos, documentosPendientes, herramientasDocumentos, proponerDocumentoEsperado, proponerRecepcionDocumento, revisarDocumento } from "./documentos";
import { buscarRegistros, herramientasCorreccion, proponerAnulacion, proponerCorreccion } from "./correcciones";
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
    description: "Devuelve horas totales, horas extra, nº de partes y coste de mano de obra reales en el periodo, por finca, trabajador, parcela y día. Para «horas por trabajador» usa por_trabajador.",
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
    description: "Devuelve tareas próximas y días recientes sin parte de trabajo registrado.",
    input_schema: { type: "object", properties: { dias: { type: "number", description: "Días hacia atrás/adelante (def. 7)" } } },
  },
  {
    name: "proponer_parte_trabajo",
    description:
      "Prepara (NO guarda) un parte de trabajo. El usuario debe confirmarlo en pantalla. " +
      "Si faltan finca, trabajadores u horas, pregunta antes de llamar. Con VARIOS trabajadores pide siempre sus nombres y usa «trabajadores»: se guarda una línea por trabajador, cada una con sus horas. " +
      "Solo usa num_trabajadores + horas_por_trabajador si la persona dice que no puede o no quiere dar los nombres.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string" }, finca: { type: "string" }, parcela: { type: "string" },
        lote: { type: "string", description: "Lote dentro de la parcela (opcional; solo si la parcela tiene lotes)" },
        trabajadores: {
          type: "array",
          description: "UNA LÍNEA POR TRABAJADOR (usar siempre que se conozcan los nombres y haya más de uno): cada uno con sus horas. Si solo hay una persona con nombre, también.",
          items: {
            type: "object",
            properties: {
              nombre: { type: "string" }, horas: { type: "number", description: "Horas totales de esa persona ese día (incluidas las extra)" },
              horas_extra: { type: "number", description: "De esas horas, cuántas son extra (opcional)" },
            },
            required: ["nombre", "horas"],
          },
        },
        num_trabajadores: { type: "number", description: "Solo si NO se conocen los nombres (el usuario no quiere o no puede darlos)" },
        horas_por_trabajador: { type: "number", description: "Horas totales de cada persona ese día (incluidas las extra); solo con num_trabajadores" },
        horas_extra_por_trabajador: { type: "number", description: "De esas horas, cuántas son extra por persona (opcional)" },
        festivo: { type: "boolean", description: "true si el usuario dice que fue festivo (los festivos dados de alta se detectan solos)" },
        equipo: { type: "string", description: "Cuadrilla/equipo (opcional); aplica las tarifas del equipo" },
        trabajador: { type: "string", description: "Trabajador concreto con condiciones propias (opcional, 1 persona)" },
        hora_entrada: { type: "string", description: "HH:MM" }, hora_salida: { type: "string", description: "HH:MM" },
        tipo_trabajo: { type: "string" }, actividad: { type: "string" },
        coste_hora: { type: "number", description: "Solo si el usuario da un precio por hora normal" }, observaciones: { type: "string" },
      },
      required: ["fecha", "finca"],
    },
  },
  {
    name: "proponer_cosecha",
    description: "Prepara (NO guarda) un registro de cosecha para confirmación del usuario. La parcela es obligatoria solo si la finca tiene parcelas dadas de alta; si no las tiene, se registra a nivel de finca (no inventes una parcela).",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string" }, finca: { type: "string" }, parcela: { type: "string" },
        lote: { type: "string", description: "Lote dentro de la parcela (opcional)" },
        cultivo: { type: "string" }, variedad: { type: "string" }, kg: { type: "number" },
        cajas: { type: "number" }, calibre: { type: "string" }, calidad: { type: "string" },
        destino: { type: "string" }, observaciones: { type: "string" },
      },
      required: ["fecha", "finca", "cultivo", "kg"],
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
    description:
      "Prepara (NO guarda) una tarea o recordatorio para confirmación. Puede tener un día concreto (fecha), " +
      "estar asignada solo a una semana (semana: cualquier fecha de esa semana) o quedar pendiente sin fecha. " +
      "No preguntes la fecha si el usuario no la da: sin día ni semana la tarea queda PENDIENTE DE ASIGNAR y se asigna después por el chat (proponer_asignacion_tarea). Si el usuario da varias tareas, crea una propuesta por cada una.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" }, fecha: { type: "string", description: "Día concreto YYYY-MM-DD (opcional)" },
        semana: { type: "string", description: "Cualquier fecha YYYY-MM-DD de la semana deseada, si no hay día fijo (opcional)" },
        finca: { type: "string" }, parcela: { type: "string" }, tipo: { type: "string" }, descripcion: { type: "string" },
      },
      required: ["titulo"],
    },
  },
];

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD");

tools.push(...herramientasCorreccion, ...herramientasDocumentos, ...herramientasTareas, ...herramientasCostes, ...herramientasDescargas, ...herramientasConsultas, ...herramientasProduccion, ...herramientasMemoria, ...herramientasDiario, ...herramientasMaestros);

// ---------- Ejecución ----------
export async function ejecutarHerramienta(name: string, input: any, ctx: Ctx): Promise<unknown> {
  const { db } = ctx;
  try {
    switch (name) {
      case "listar_fincas_parcelas": {
        const { data } = await db
          .from("fincas")
          .select("codigo,nombre,tipo_explotacion,superficie_ha,parcelas(codigo,nombre,superficie_ha,estado,lotes(codigo,nombre),cultivos_parcela(cultivo,variedad,fecha_prevista_cosecha)),equipos(nombre,activo),trabajadores(nombre,activo)")
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
          por_parcela: agg((r) => r.parcelas?.codigo ?? "sin parcela"), por_variedad: agg((r) => r.variedad ?? "sin variedad"),
          por_dia: agg((r) => r.fecha), kg_por_trabajador_hora: kgPorHora, nota_rendimiento,
          truncado: rows.length >= ROW_CAP,
        };
      }
      case "consultar_mano_obra": {
        const p = z.object({ desde: fecha, hasta: fecha }).parse(input);
        const ref = await resolver(db, input.finca, input.parcela);
        if (esError(ref)) return ref;
        let q = db.from("partes_trabajo").select("fecha,horas_totales,horas_extra_totales,coste_total,num_trabajadores,trabajador_nombre,parcelas(codigo),fincas(nombre),trabajadores(nombre),equipos(nombre)").gte("fecha", p.desde).lte("fecha", p.hasta).limit(ROW_CAP);
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
          horas_extra: round(sum(rows.map((r) => r.horas_extra_totales))),
          por_finca: por((r) => r.fincas?.nombre ?? "sin finca"),
          por_trabajador: por((r) => r.trabajadores?.nombre ?? r.trabajador_nombre ?? (r.equipos?.nombre ? `Equipo ${r.equipos.nombre}` : "sin nombre")),
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
        const [tareas, sinDia, partes, acciones] = await Promise.all([
          db.from("tareas").select("titulo,fecha,semana_inicio,tipo").eq("completada", false).lte("fecha", iso(hasta)).order("fecha").limit(50),
          db.from("tareas").select("titulo,semana_inicio,tipo").eq("completada", false).is("fecha", null).limit(50),
          db.from("partes_trabajo").select("fecha").gte("fecha", iso(desde)).lte("fecha", iso(hoy)),
          db.from("acciones_pendientes").select("resumen,created_at").eq("estado", "pendiente"),
        ]);
        const conParte = new Set((partes.data ?? []).map((x: any) => x.fecha));
        const sinParte: string[] = [];
        for (let d = new Date(desde); d <= hoy; d = new Date(d.getTime() + 864e5)) if (!conParte.has(iso(d))) sinParte.push(iso(d));
        return { tareas: tareas.data, tareas_sin_dia: sinDia.data /* semana_inicio nulo = pendiente sin fecha */, dias_sin_parte: sinParte, acciones_sin_confirmar: acciones.data };
      }
      case "proponer_maestro":
        return await proponerMaestro(input, ctx);
      case "proponer_novedad":
        return await proponerNovedad(input, ctx);
      case "buscar_diario":
        return await buscarDiario(input, ctx);
      case "proponer_retirar_novedad":
        return await proponerRetirarNovedad(input, ctx);
      case "proponer_memoria":
        return await proponerMemoria(input, ctx);
      case "proponer_olvidar_memoria":
        return await proponerOlvidarMemoria(input, ctx);
      case "consultar_produccion_anual":
        return await consultarProduccionAnual(input, ctx);
      case "consultar_maestros":
        return await consultarMaestros(input, ctx);
      case "preparar_descarga":
        return await prepararDescarga(db, ctx, input);
      case "consultar_costes_generales":
        return await consultarCostesGenerales(input, ctx);
      case "buscar_tareas":
        return await buscarTareas(input, ctx);
      case "proponer_asignacion_tarea":
        return await proponerAsignacionTarea(input, ctx);
      case "proponer_completar_tarea":
        return await proponerCompletarTarea(input, ctx);
      case "buscar_documentos":
        return await buscarDocumentos(input, ctx);
      case "documentos_pendientes":
        return await documentosPendientes(input, ctx);
      case "revisar_documento":
        return await revisarDocumento(input, ctx);
      case "proponer_documento_esperado":
        return await proponerDocumentoEsperado(input, ctx);
      case "proponer_recepcion_documento":
        return await proponerRecepcionDocumento(input, ctx);
      case "buscar_registros":
        return await buscarRegistros(input, ctx);
      case "proponer_correccion":
        return await proponerCorreccion(input, ctx);
      case "proponer_anulacion":
        return await proponerAnulacion(input, ctx);
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
  // Una finca sin parcelas dadas de alta trabaja a nivel de finca: se ignora una «parcela» inventada con su mismo nombre
  let sinParcelas = false;
  if (i.finca) {
    const f = await resolver(ctx.db, i.finca);
    if (!esError(f) && f.finca_id) {
      const { count } = await ctx.db.from("parcelas").select("id", { count: "exact", head: true }).eq("finca_id", f.finca_id);
      sinParcelas = (count ?? 0) === 0;
    }
  }
  const ref = await resolver(ctx.db, i.finca, sinParcelas ? undefined : i.parcela, sinParcelas ? undefined : i.lote);
  if (esError(ref)) return ref;
  if (name !== "proponer_tarea" && !ref.finca_id) return { error: "Falta la finca. Pregunta al usuario." };
  if (name === "proponer_cosecha" && !ref.parcela_id && !sinParcelas) return { error: "Falta la parcela (esta finca tiene parcelas: pregunta cuál; usa listar_fincas_parcelas para ver cuáles)." };
  if (name !== "proponer_tarea" || i.fecha) fecha.parse(i.fecha);
  if (name === "proponer_tarea" && i.semana) fecha.parse(i.semana);

  let tipo: string, payload: Record<string, unknown>, resumen: string;
  const lugar = `${ref.finca ?? "—"}${ref.parcela ? ` · parcela ${ref.parcela}` : ""}${ref.lote ? ` · lote ${ref.lote}` : ""}`;
  if (name === "proponer_parte_trabajo" && Array.isArray(i.trabajadores) && i.trabajadores.length) {
    // Una línea por trabajador, con una sola confirmación
    if (i.equipo || i.trabajador) return { error: "Con la lista «trabajadores» no uses equipo ni trabajador sueltos." };
    if (i.trabajadores.length > 40) return { error: "Demasiados trabajadores en un parte (máximo 40)." };
    const vistos = new Set<string>();
    const lineas: { trabajador_id: string | null; trabajador_nombre: string | null; horas: number; horas_extra: number; nombre: string; enMaestros: boolean }[] = [];
    for (const t of i.trabajadores) {
      const nombre = String(t?.nombre ?? "").trim();
      const horas = Number(t?.horas), extra = Number(t?.horas_extra ?? 0);
      if (!nombre) return { error: "Falta el nombre de un trabajador. Pregunta." };
      if (!(horas > 0) || horas > 24) return { error: `Las horas de ${nombre} deben estar entre 0 y 24. Pregunta.` };
      if (!(extra >= 0) || extra > horas) return { error: `Las horas extra de ${nombre} no pueden superar sus horas. Pregunta.` };
      if (vistos.has(nombre.toLowerCase())) return { error: `${nombre} aparece dos veces en el parte.` };
      vistos.add(nombre.toLowerCase());
      const p: any = await resolverPersonal(ctx.db, ref.finca_id, undefined, nombre);
      if (p.error && /ambiguo/.test(p.error)) return p; // varios con ese nombre: hay que preguntar
      lineas.push(p.trabajador_id
        ? { trabajador_id: p.trabajador_id, trabajador_nombre: null, horas, horas_extra: extra, nombre: p.nombre, enMaestros: true }
        : { trabajador_id: null, trabajador_nombre: nombre, horas, horas_extra: extra, nombre, enMaestros: false });
    }
    const total = round(lineas.reduce((a, l) => a + l.horas, 0));
    const sinAlta = lineas.filter((l) => !l.enMaestros).map((l) => l.nombre);
    tipo = "registrar_parte_lineas";
    payload = {
      comun: {
        fecha: i.fecha, finca_id: ref.finca_id, parcela_id: ref.parcela_id ?? null, lote_id: ref.lote_id ?? null, festivo: i.festivo === true,
        hora_entrada: i.hora_entrada ?? null, hora_salida: i.hora_salida ?? null, tipo_trabajo: i.tipo_trabajo ?? null, actividad: i.actividad ?? null,
        coste_hora: i.coste_hora ?? null, observaciones: i.observaciones ?? null, origen: "chat",
      },
      lineas: lineas.map(({ trabajador_id, trabajador_nombre, horas, horas_extra }) => ({ trabajador_id, trabajador_nombre, horas, horas_extra })),
    };
    resumen = `Parte de trabajo · ${i.fecha} · ${lugar}\n${lineas.length} línea${lineas.length > 1 ? "s" : ""} (una por trabajador):\n` +
      lineas.map((l) => `• ${l.nombre}: ${l.horas} h${l.horas_extra > 0 ? ` (${l.horas_extra} extra)` : ""}`).join("\n") + `\nTotal ${total} h` +
      (i.festivo === true ? "\nDía festivo" : "") + (i.actividad ? `\nActividad: ${i.actividad}` : "") +
      (sinAlta.length ? `\n⚠ Sin alta en Maestros → Personal (quedarán «sin tarifa»): ${sinAlta.join(", ")}` : "\nCoste: con las tarifas de cada trabajador en Maestros");
  } else if (name === "proponer_parte_trabajo") {
    if (!(Number(i.num_trabajadores) > 0) || !(Number(i.horas_por_trabajador) > 0)) return { error: "Faltan los trabajadores con sus horas (o, si no hay nombres, el nº de personas y las horas por persona). Pregunta." };
    const personal = await resolverPersonal(ctx.db, ref.finca_id, i.equipo, i.trabajador);
    if (esError(personal as any)) return personal;
    const extra = Number(i.horas_extra_por_trabajador ?? 0);
    if (!(extra >= 0) || extra > Number(i.horas_por_trabajador)) return { error: "Las horas extra por persona no pueden superar las horas por persona. Pregunta al usuario." };
    if (i.trabajador && Number(i.num_trabajadores) !== 1) return { error: "Un parte de un trabajador concreto es de 1 persona. Pregunta al usuario." };
    const total = round(Number(i.num_trabajadores) * Number(i.horas_por_trabajador));
    tipo = "registrar_parte";
    payload = {
      fecha: i.fecha, finca_id: ref.finca_id, parcela_id: ref.parcela_id ?? null, lote_id: ref.lote_id ?? null,
      equipo_id: (personal as any).equipo_id ?? null, trabajador_id: (personal as any).trabajador_id ?? null,
      horas_extra_por_trabajador: extra, festivo: i.festivo === true,
      num_trabajadores: i.num_trabajadores, horas_por_trabajador: i.horas_por_trabajador,
      hora_entrada: i.hora_entrada ?? null, hora_salida: i.hora_salida ?? null,
      tipo_trabajo: i.tipo_trabajo ?? null, actividad: i.actividad ?? null,
      coste_hora: i.coste_hora ?? null, observaciones: i.observaciones ?? null, origen: "chat",
    };
    resumen = `Parte de trabajo · ${i.fecha} · ${lugar}\n${i.num_trabajadores} trabajadores × ${i.horas_por_trabajador} h = ${total} h` +
      (extra > 0 ? ` (de ellas ${round(extra * Number(i.num_trabajadores))} h extra)` : "") +
      ((personal as any).nombre ? `\n${i.trabajador ? "Trabajador" : "Equipo"}: ${(personal as any).nombre}` : "") +
      (i.festivo === true ? "\nDía festivo" : "") +
      (i.actividad ? `\nActividad: ${i.actividad}` : "") +
      (i.coste_hora ? `\nTarifa normal indicada: ${i.coste_hora} €/h` : "\nCoste: se calculará con las tarifas de Maestros (sin tarifa quedará «sin tarifa»)");
  } else if (name === "proponer_cosecha") {
    tipo = "registrar_cosecha";
    payload = {
      fecha: i.fecha, finca_id: ref.finca_id, parcela_id: ref.parcela_id ?? null, lote_id: ref.lote_id ?? null, cultivo: i.cultivo,
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
    const semana = !i.fecha && i.semana ? lunesDe(i.semana) : null;
    payload = {
      titulo: i.titulo, fecha: i.fecha ?? null, semana_inicio: semana, finca_id: ref.finca_id ?? null, parcela_id: ref.parcela_id ?? null,
      tipo: i.tipo ?? "recordatorio", descripcion: i.descripcion ?? null, origen: "chat",
    };
    const cuando = i.fecha ? i.fecha : semana ? `semana del ${semana.slice(8)}/${semana.slice(5, 7)}` : "pendiente de asignar (sin día ni semana)";
    resumen = `Tarea · ${cuando}${ref.finca ? ` · ${lugar}` : ""}\n${i.titulo}`;
  }

  const { data, error } = await ctx.db
    .from("acciones_pendientes")
    .insert({ conversacion_id: ctx.conversacionId, user_id: ctx.userId, tipo, payload, resumen })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return {
    accion_id: data.id, tipo, resumen,
    instruccion: "Propuesta creada y NO guardada todavía. La persona ya ve la tarjeta con el resumen y el botón: no repitas el resumen ni los datos; di en una frase natural que te lo dejas preparado para que lo confirme. No afirmes que ya está guardado.",
  };
}
