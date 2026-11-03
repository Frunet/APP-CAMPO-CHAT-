import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Consulta de solo lectura para sistemas externos (p. ej. un GPT de ChatGPT con «Acciones»).
 * - Autenticación propia con una clave (Authorization: Bearer <clave> o X-API-Key); en la base solo se guarda su hash (tabla api_consulta).
 * - Solo lectura. api_consulta.expone_nombres = false → solo códigos de trabajador. api_consulta.incluye_finanzas = false (por defecto)
 *   → no se ven gastos, ventas, resultados, costes ni tarifas.
 * Rutas (tras /functions/v1/consulta-horas):
 *   GET /openapi.json (pública) · /catalogos · /horas/resumen · /horas/registros · /conjuntos · /datos/{conjunto} · /resumen/{conjunto}
 */
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const MAYORES = ["Instalaciones", "Suelos", "Liado y guiado", "Otros cuidados de planta", "Riego", "Cosecha", "Otros", "Revisión finca"];
const TAREAS = ["Obra", "Reparaciones", "Hierba", "Poda", "Aplicaciones foliares", "Riego", "Cosecha", "Otros", "Revisión finca"];
const r2 = (n: number) => Math.round(n * 100) / 100;
const PREFIJO = /^(\d+)\s*-\s*/;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-api-key, content-type", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ---------------- Conjuntos de datos (lo que se puede consultar) ----------------
type Ctx = { nombres: boolean; perfiles: Map<string, string> };
type DS = {
  titulo: string; descripcion: string; tabla: string; select: string; fecha?: string; fin?: boolean;
  mapa: (r: any, c: Ctx) => Record<string, unknown>; agrupables: string[]; sumables: string[]; orden?: string;
};
const num = (v: unknown) => (v == null ? null : Number(v));
const mes = (f?: string | null) => (f ? f.slice(0, 7) : null);
const anio = (f?: string | null) => (f ? Number(f.slice(0, 4)) : null);
/** Persona: código y nombre (el nombre solo si la clave lo permite). */
const persona = (nombreBruto: string | null | undefined, codigo: string | null | undefined, c: Ctx) => {
  const b = nombreBruto ?? "Sin nombre";
  const cod = codigo ?? PREFIJO.exec(b)?.[1] ?? null;
  return { codigo: cod, trabajador: c.nombres ? b.replace(PREFIJO, "") : (cod ? `Trabajador ${cod}` : "Trabajador sin código") };
};

const DATASETS: Record<string, DS> = {
  fincas: {
    titulo: "Fincas", descripcion: "Fincas de la empresa (código, nombre, tipo, superficie).", tabla: "fincas", select: "codigo,nombre,tipo_explotacion,superficie_ha,ubicacion,activa",
    mapa: (r) => ({ codigo: r.codigo, finca: r.nombre, tipo: r.tipo_explotacion, superficie_ha: num(r.superficie_ha), ubicacion: r.ubicacion, activa: r.activa }), agrupables: ["tipo", "activa"], sumables: ["superficie_ha"], orden: "nombre",
  },
  parcelas: {
    titulo: "Parcelas", descripcion: "Parcelas de cada finca.", tabla: "parcelas", select: "codigo,nombre,superficie_ha,estado,fincas(nombre)",
    mapa: (r) => ({ finca: r.fincas?.nombre, parcela: r.codigo, nombre: r.nombre, superficie_ha: num(r.superficie_ha), estado: r.estado }), agrupables: ["finca", "estado"], sumables: ["superficie_ha"], orden: "codigo",
  },
  cultivos_asignados: {
    titulo: "Cultivos por parcela", descripcion: "Qué cultivo y variedad hay en cada parcela, con fechas de plantación y cosecha prevista.", tabla: "cultivos_parcela",
    select: "cultivo,variedad,fecha_plantacion,fecha_prevista_cosecha,parcelas(codigo,fincas(nombre)),campanas(nombre)",
    mapa: (r) => ({ finca: r.parcelas?.fincas?.nombre, parcela: r.parcelas?.codigo, cultivo: r.cultivo, variedad: r.variedad, campana: r.campanas?.nombre, plantacion: r.fecha_plantacion, cosecha_prevista: r.fecha_prevista_cosecha }),
    agrupables: ["finca", "cultivo", "variedad", "campana"], sumables: [],
  },
  cultivos: { titulo: "Catálogo de cultivos", descripcion: "Cultivos y variedades dados de alta.", tabla: "cultivos_maestro", select: "cultivo,variedad,activo", mapa: (r) => ({ cultivo: r.cultivo, variedad: r.variedad, activo: r.activo }), agrupables: ["cultivo", "activo"], sumables: [], orden: "cultivo" },
  campanas: { titulo: "Campañas", descripcion: "Campañas agrícolas.", tabla: "campanas", select: "nombre,fecha_inicio,fecha_fin", mapa: (r) => ({ campana: r.nombre, inicio: r.fecha_inicio, fin: r.fecha_fin }), agrupables: [], sumables: [], orden: "fecha_inicio" },
  festivos: { titulo: "Festivos", descripcion: "Festivos definidos.", tabla: "festivos", select: "fecha,nombre,fincas(nombre)", fecha: "fecha", mapa: (r) => ({ fecha: r.fecha, festivo: r.nombre, finca: r.fincas?.nombre ?? "Todas" }), agrupables: ["finca"], sumables: [], orden: "fecha" },
  trabajadores: {
    titulo: "Trabajadores", descripcion: "Personal (código y, si está permitido, nombre) y su finca.", tabla: "trabajadores", select: "codigo,nombre,activo,fincas(nombre)",
    mapa: (r, c) => ({ ...persona(r.nombre, r.codigo, c), finca: r.fincas?.nombre ?? null, activo: r.activo }), agrupables: ["finca", "activo"], sumables: [], orden: "nombre",
  },
  equipos: { titulo: "Equipos", descripcion: "Cuadrillas.", tabla: "equipos", select: "nombre,activo,fincas(nombre)", mapa: (r) => ({ equipo: r.nombre, finca: r.fincas?.nombre, activo: r.activo }), agrupables: ["finca", "activo"], sumables: [] },
  cosechas: {
    titulo: "Cosechas", descripcion: "Kg cosechados por día, finca, cultivo y variedad.", tabla: "cosechas", select: "fecha,cultivo,variedad,kg,cajas,calibre,calidad,destino,observaciones,fincas(nombre),parcelas(codigo)", fecha: "fecha",
    mapa: (r) => ({ fecha: r.fecha, mes: mes(r.fecha), anio: anio(r.fecha), finca: r.fincas?.nombre, parcela: r.parcelas?.codigo ?? null, cultivo: r.cultivo, variedad: r.variedad, kg: num(r.kg), cajas: num(r.cajas), calibre: r.calibre, calidad: r.calidad, destino: r.destino, observaciones: r.observaciones }),
    agrupables: ["finca", "cultivo", "variedad", "mes", "anio", "calidad", "destino", "parcela"], sumables: ["kg", "cajas"], orden: "fecha",
  },
  produccion_anual: {
    titulo: "Producción anual", descripcion: "Histórico de producción por finca, cultivo y año (kg; el importe solo con permiso de finanzas).", tabla: "produccion_anual", select: "anio,cultivo,kg,importe,fincas(nombre)",
    mapa: (r, c: any) => ({ anio: r.anio, finca: r.fincas?.nombre, cultivo: r.cultivo, kg: num(r.kg), ...(c.fin ? { importe: num(r.importe) } : {}) }), agrupables: ["finca", "cultivo", "anio"], sumables: ["kg", "importe"], orden: "anio",
  },
  horas_tractor: {
    titulo: "Horas de tractor", descripcion: "Horas de tractor por día y finca (no son del personal).", tabla: "horas_tractor", select: "fecha,horas,observaciones,fincas(nombre)", fecha: "fecha",
    mapa: (r) => ({ fecha: r.fecha, mes: mes(r.fecha), finca: r.fincas?.nombre, horas: num(r.horas), observaciones: r.observaciones }), agrupables: ["finca", "mes", "fecha"], sumables: ["horas"], orden: "fecha",
  },
  tareas: {
    titulo: "Calendario de tareas", descripcion: "Tareas por hacer (con fecha o pendientes sin fecha), con tipo, finca y si están hechas.", tabla: "tareas", select: "titulo,descripcion,tipo,fecha,completada,asignado_a,fincas(nombre)", fecha: "fecha",
    mapa: (r, c) => ({ fecha: r.fecha, mes: mes(r.fecha), tarea: r.titulo, detalle: r.descripcion, tipo: r.tipo, finca: r.fincas?.nombre ?? null, hecha: r.completada, asignada_a: r.asignado_a ? c.perfiles.get(r.asignado_a) ?? null : null }),
    agrupables: ["tipo", "finca", "hecha", "mes", "asignada_a"], sumables: [], orden: "fecha",
  },
  diario: {
    titulo: "Diario de fincas", descripcion: "Novedades anotadas por finca (avances, incidencias, avisos).", tabla: "diario_fincas", select: "fecha,tipo,tema,texto,autor_nombre,activa,fincas(nombre)", fecha: "fecha",
    mapa: (r) => ({ fecha: r.fecha, mes: mes(r.fecha), finca: r.fincas?.nombre, tipo: r.tipo, tema: r.tema, texto: r.texto, autor: r.autor_nombre, activa: r.activa }), agrupables: ["finca", "tipo", "tema", "mes"], sumables: [], orden: "fecha",
  },
  documentos: {
    titulo: "Documentos", descripcion: "Lista de documentos subidos (nombre, tipo, estado y fecha; no su contenido).", tabla: "documentos", select: "nombre,tipo,estado,fecha_documento,created_at,fincas(nombre)",
    mapa: (r) => ({ documento: r.nombre, tipo: r.tipo, estado: r.estado, fecha: r.fecha_documento, subido: r.created_at, finca: r.fincas?.nombre ?? null }), agrupables: ["tipo", "estado", "finca"], sumables: [], orden: "created_at",
  },
  // ----- Económicos: solo con incluye_finanzas -----
  gastos: {
    titulo: "Gastos", descripcion: "Facturas recibidas y gastos por finca (importe sin IVA).", tabla: "gastos", fin: true, fecha: "fecha",
    select: "fecha,proveedor,categoria,categoria_resultado,concepto,importe,iva_importe,numero_factura,tipo_importe,fincas(nombre)",
    mapa: (r) => ({ fecha: r.fecha, mes: mes(r.fecha), anio: anio(r.fecha), finca: r.fincas?.nombre, proveedor: r.proveedor, categoria: r.categoria, categoria_resultado: r.categoria_resultado, concepto: r.concepto, importe: num(r.importe), iva: num(r.iva_importe), factura: r.numero_factura, tipo_importe: r.tipo_importe }),
    agrupables: ["finca", "proveedor", "categoria", "categoria_resultado", "mes", "anio"], sumables: ["importe", "iva"], orden: "fecha",
  },
  ventas: {
    titulo: "Ventas", descripcion: "Facturas emitidas por finca (importe sin IVA).", tabla: "ventas", fin: true, fecha: "fecha", select: "fecha,cliente,numero_factura,importe,iva_importe,fincas(nombre)",
    mapa: (r) => ({ fecha: r.fecha, mes: mes(r.fecha), anio: anio(r.fecha), finca: r.fincas?.nombre, cliente: r.cliente, factura: r.numero_factura, importe: num(r.importe), iva: num(r.iva_importe) }),
    agrupables: ["finca", "cliente", "mes", "anio"], sumables: ["importe", "iva"], orden: "fecha",
  },
  movimientos: {
    titulo: "Movimientos sin factura", descripcion: "Jornales, nóminas, préstamos, tributos… sin factura.", tabla: "movimientos_resultado", fin: true, fecha: "fecha", select: "fecha,tipo,categoria,concepto,importe,fincas(nombre)",
    mapa: (r) => ({ fecha: r.fecha, mes: mes(r.fecha), anio: anio(r.fecha), finca: r.fincas?.nombre, tipo: r.tipo, categoria: r.categoria, concepto: r.concepto, importe: num(r.importe) }), agrupables: ["finca", "tipo", "categoria", "mes", "anio"], sumables: ["importe"], orden: "fecha",
  },
  costes_generales: {
    titulo: "Costes generales", descripcion: "Personal fijo, amortizaciones, seguros, financieros…", tabla: "costes_generales", fin: true, select: "concepto,categoria,importe,periodicidad,desde,hasta,reparto,fincas(nombre)",
    mapa: (r) => ({ concepto: r.concepto, categoria: r.categoria, finca: r.fincas?.nombre ?? "General", importe: num(r.importe), periodicidad: r.periodicidad, desde: r.desde, hasta: r.hasta }), agrupables: ["categoria", "finca", "periodicidad"], sumables: ["importe"],
  },
  coste_horas: {
    titulo: "Coste de las horas", descripcion: "Horas registradas con su coste (tarifa aplicada a cada parte).", tabla: "partes_trabajo", fin: true, fecha: "fecha",
    select: "fecha,tipo_trabajo,mayor,horas_totales,coste_total,coste_hora,trabajador_nombre,trabajadores(codigo,nombre),fincas(nombre)",
    mapa: (r, c) => ({ fecha: r.fecha, mes: mes(r.fecha), ...persona(r.trabajadores?.nombre ?? r.trabajador_nombre, r.trabajadores?.codigo, c), finca: r.fincas?.nombre, mayor: r.mayor, tarea: r.tipo_trabajo, horas: num(r.horas_totales), coste: num(r.coste_total), tarifa_hora: num(r.coste_hora) }),
    agrupables: ["finca", "trabajador", "mayor", "tarea", "mes"], sumables: ["horas", "coste"], orden: "fecha",
  },
  tarifas: {
    titulo: "Tarifas por hora", descripcion: "Tarifas normal, extra y festivo de cada trabajador, con su histórico.", tabla: "trabajadores_coste", fin: true, select: "desde,coste_hora,coste_hora_extra,coste_hora_festivo,trabajadores(codigo,nombre)",
    mapa: (r, c) => ({ ...persona(r.trabajadores?.nombre, r.trabajadores?.codigo, c), desde: r.desde, normal: num(r.coste_hora), extra: num(r.coste_hora_extra), festivo: num(r.coste_hora_festivo) }), agrupables: ["trabajador"], sumables: [], orden: "desde",
  },
  proveedores: { titulo: "Proveedores", descripcion: "Proveedores y su categoría por defecto.", tabla: "proveedores", fin: true, select: "nombre,nif,categoria_defecto,activo", mapa: (r) => ({ proveedor: r.nombre, nif: r.nif, categoria: r.categoria_defecto, activo: r.activo }), agrupables: ["categoria", "activo"], sumables: [], orden: "nombre" },
};
const NOMBRES_DS = Object.keys(DATASETS);

function especificacion(base: string) {
  const filtros = [
    { name: "desde", in: "query", schema: { type: "string", format: "date" }, description: "Fecha inicial (AAAA-MM-DD). Por defecto, hace 30 días." },
    { name: "hasta", in: "query", schema: { type: "string", format: "date" }, description: "Fecha final (AAAA-MM-DD). Por defecto, hoy." },
    { name: "finca", in: "query", schema: { type: "string" }, description: "Nombre (o parte) de la finca, p. ej. 'Rio Velez'." },
    { name: "trabajador", in: "query", schema: { type: "string" }, description: "Código o nombre (o parte) del trabajador, p. ej. '3008'." },
    { name: "mayor", in: "query", schema: { type: "string", enum: MAYORES }, description: "Agrupación de tareas." },
    { name: "tarea", in: "query", schema: { type: "string" }, description: "Tarea concreta, p. ej. 'Poda'." },
  ];
  const conjunto = { name: "conjunto", in: "path", required: true, schema: { type: "string", enum: NOMBRES_DS }, description: "Conjunto de datos. Mira listarConjuntos para saber qué contiene cada uno y sus campos." };
  const comunes = [
    { name: "desde", in: "query", schema: { type: "string", format: "date" }, description: "Fecha inicial (AAAA-MM-DD) para los conjuntos con fecha. Si no se indica, no se limita por fecha." },
    { name: "hasta", in: "query", schema: { type: "string", format: "date" }, description: "Fecha final (AAAA-MM-DD)." },
    { name: "finca", in: "query", schema: { type: "string" }, description: "Nombre (o parte) de la finca." },
    { name: "buscar", in: "query", schema: { type: "string" }, description: "Texto libre: busca en todos los campos de texto." },
    { name: "filtros", in: "query", schema: { type: "string" }, description: "Filtros por campo, separados por ';' : 'cultivo=Mango;variedad=Osteen'. Los campos disponibles están en listarConjuntos." },
  ];
  return {
    openapi: "3.1.0",
    info: { title: "Datos de campo Frunet (solo lectura)", version: "2.0.0", description: "Consulta toda la información de la app de campo de Frunet: horas, cosechas, producción, fincas, personal, calendario, diario, documentos y (si está permitido) datos económicos. Solo lectura." },
    servers: [{ url: base }],
    paths: {
      "/conjuntos": { get: { operationId: "listarConjuntos", summary: "Qué conjuntos de datos hay, qué campos tienen y cuáles se pueden agrupar o sumar. Llamar primero.", responses: { "200": { description: "OK" } } } },
      "/datos/{conjunto}": {
        get: {
          operationId: "consultarDatos", summary: "Filas de un conjunto de datos (con filtros)",
          parameters: [conjunto, ...comunes, { name: "orden", in: "query", schema: { type: "string" }, description: "Campo por el que ordenar; con '-' delante, descendente (p. ej. '-kg')." }, { name: "limite", in: "query", schema: { type: "integer", minimum: 1, maximum: 300, default: 100 }, description: "Máximo de filas." }],
          responses: { "200": { description: "OK" } },
        },
      },
      "/resumen/{conjunto}": {
        get: {
          operationId: "resumenDatos", summary: "Totales de un conjunto agrupados por uno o varios campos (p. ej. kg de cosecha por finca y mes)",
          parameters: [conjunto, ...comunes, { name: "agrupar", in: "query", schema: { type: "string" }, description: "Uno o dos campos agrupables separados por coma, p. ej. 'finca,mes'." }, { name: "suma", in: "query", schema: { type: "string" }, description: "Campo numérico a sumar, p. ej. 'kg' o 'importe'. Si se omite, solo se cuentan filas." }],
          responses: { "200": { description: "OK" } },
        },
      },
      "/catalogos": { get: { operationId: "obtenerCatalogos", summary: "Fincas, trabajadores, mayores y tareas de horas", responses: { "200": { description: "OK" } } } },
      "/horas/resumen": {
        get: {
          operationId: "resumenHoras", summary: "Totales de horas de personal agrupados (por trabajador, día, mes, mayor, tarea o finca)",
          parameters: [...filtros, { name: "agrupar", in: "query", schema: { type: "string", enum: ["trabajador", "dia", "mes", "mayor", "tarea", "finca"], default: "trabajador" }, description: "Cómo agrupar los totales." }],
          responses: { "200": { description: "OK" } },
        },
      },
      "/horas/registros": {
        get: {
          operationId: "registrosHoras", summary: "Lista de registros de horas (los más recientes primero)",
          parameters: [...filtros, { name: "limite", in: "query", schema: { type: "integer", minimum: 1, maximum: 300, default: 100 }, description: "Máximo de registros." }],
          responses: { "200": { description: "OK" } },
        },
      },
    },
    components: { securitySchemes: { clave: { type: "http", scheme: "bearer" } } },
    security: [{ clave: [] }],
  };
}

type Parte = {
  fecha: string; mayor: string | null; tipo_trabajo: string | null; actividad: string | null; num_trabajadores: number; horas_totales: number; horas_extra_totales: number;
  trabajador_id: string | null; trabajador_nombre: string | null; trabajadores: { codigo: string | null; nombre: string } | null; fincas: { nombre: string } | null;
};

/** Lee todas las filas de una tabla paginando. */
async function leer(tabla: string, select: string, fecha: string | undefined, desde: string | null, hasta: string | null, orden?: string) {
  const out: any[] = [];
  for (let a = 0; a < 50000; a += 1000) {
    let c = admin.from(tabla).select(select).range(a, a + 999);
    if (fecha && desde) c = c.gte(fecha, desde);
    if (fecha && hasta) c = c.lte(fecha, hasta);
    if (orden) c = c.order(orden, { ascending: orden === "nombre" || orden === "codigo" || orden === "fecha_inicio" });
    const { data, error } = await c;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return json({ error: "Solo se admiten consultas (GET)" }, 405);
  const url = new URL(req.url);
  const ruta = url.pathname.replace(/^.*\/consulta-horas/, "").replace(/\/$/, "") || "/";
  const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1/consulta-horas`; // la dirección pública (el gateway recorta la ruta y llega como http)

  if (ruta === "/openapi.json") return json(especificacion(base));

  // Autenticación por clave (solo se compara el hash)
  const cabecera = req.headers.get("authorization") ?? "";
  const clave = (cabecera.startsWith("Bearer ") ? cabecera.slice(7) : req.headers.get("x-api-key") ?? "").trim();
  if (!clave) return json({ error: "Falta la clave de acceso" }, 401);
  const { data: k } = await admin.from("api_consulta").select("*").eq("clave_hash", await sha256(clave)).eq("activa", true).maybeSingle();
  if (!k) return json({ error: "Clave no válida" }, 401);
  admin.from("api_consulta").update({ ultimo_uso: new Date().toISOString() }).eq("id", k.id).then(() => {});
  const nombres = !!k.expone_nombres;
  const finanzas = !!k.incluye_finanzas;

  try {
    // ---------- conjuntos de datos genéricos ----------
    if (ruta === "/conjuntos") {
      return json({
        permisos: { nombres_de_trabajadores: nombres, datos_economicos: finanzas },
        conjuntos: NOMBRES_DS.map((n) => {
          const d = DATASETS[n];
          const muestra = d.mapa({}, { nombres, perfiles: new Map(), fin: finanzas } as any);
          return { conjunto: n, titulo: d.titulo, descripcion: d.descripcion, disponible: !d.fin || finanzas, campos: Object.keys(muestra), agrupables: d.agrupables, sumables: d.sumables, tiene_fecha: !!d.fecha };
        }),
        horas_de_personal: "Para horas usa resumenHoras y registrosHoras (más completos). 'coste_horas' solo con permiso económico.",
      });
    }
    const mDatos = /^\/(datos|resumen)\/([a-z_]+)$/.exec(ruta);
    if (mDatos) {
      const [, modo, nombre] = mDatos;
      const ds = DATASETS[nombre];
      if (!ds) return json({ error: `Conjunto desconocido: ${nombre}`, conjuntos: NOMBRES_DS }, 404);
      if (ds.fin && !finanzas) return json({ error: `El conjunto «${nombre}» contiene datos económicos y esta clave no tiene permiso para verlos.` }, 403);
      const q = (n: string) => (url.searchParams.get(n) ?? "").trim();
      const ok = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
      const perfiles = new Map<string, string>();
      if (nombre === "tareas") for (const p of (await admin.from("profiles").select("id,nombre")).data ?? []) perfiles.set(p.id, p.nombre);
      const ctx = { nombres, perfiles, fin: finanzas } as unknown as Ctx;
      let filas = (await leer(ds.tabla, ds.select, ds.fecha, ok(q("desde")), ok(q("hasta")), ds.orden)).map((r) => ds.mapa(r, ctx));

      const quita = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const fincaTxt = quita(q("finca"));
      if (fincaTxt) filas = filas.filter((r) => quita(String(r.finca ?? "")).includes(fincaTxt));
      const buscar = quita(q("buscar"));
      if (buscar) filas = filas.filter((r) => Object.values(r).some((v) => typeof v === "string" && quita(v).includes(buscar)));
      for (const par of q("filtros").split(";").map((x) => x.trim()).filter(Boolean)) {
        const i = par.indexOf("=");
        if (i < 1) continue;
        const campo = par.slice(0, i).trim(), valor = quita(par.slice(i + 1));
        filas = filas.filter((r) => quita(String(r[campo] ?? "")).includes(valor));
      }

      if (modo === "datos") {
        const orden = q("orden");
        if (orden) {
          const campo = orden.replace(/^-/, ""), desc = orden.startsWith("-");
          filas.sort((a, b) => { const x = a[campo] as any, y = b[campo] as any; return (x == null ? 1 : y == null ? -1 : x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1); });
        }
        const limite = Math.min(300, Math.max(1, Number(q("limite")) || 100));
        return json({ conjunto: nombre, total_filas: filas.length, mostrando: Math.min(limite, filas.length), filas: filas.slice(0, limite) });
      }
      // resumen
      const campos = q("agrupar").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 2);
      for (const c of campos) if (!ds.agrupables.includes(c)) return json({ error: `No se puede agrupar por «${c}»`, agrupables: ds.agrupables }, 400);
      const suma = q("suma");
      if (suma && !ds.sumables.includes(suma)) return json({ error: `No se puede sumar «${suma}»`, sumables: ds.sumables }, 400);
      const grupos = new Map<string, any>();
      for (const r of filas) {
        const clave = campos.map((c) => String(r[c] ?? "—")).join(" | ") || "total";
        const g = grupos.get(clave) ?? { ...Object.fromEntries(campos.map((c) => [c, r[c] ?? null])), registros: 0, ...(suma ? { [`suma_${suma}`]: 0 } : {}) };
        g.registros++;
        if (suma) g[`suma_${suma}`] += Number(r[suma] ?? 0);
        grupos.set(clave, g);
      }
      const lista = [...grupos.values()].map((g) => (suma ? { ...g, [`suma_${suma}`]: r2(g[`suma_${suma}`]) } : g));
      lista.sort((a, b) => (suma ? b[`suma_${suma}`] - a[`suma_${suma}`] : b.registros - a.registros));
      return json({
        conjunto: nombre, agrupado_por: campos, suma: suma || null, total_filas: filas.length,
        ...(suma ? { total: r2(filas.reduce((a, r) => a + Number(r[suma] ?? 0), 0)) } : {}), grupos: lista.slice(0, 200),
      });
    }

    // ---------- horas de personal (endpoints específicos) ----------
    if (ruta === "/catalogos") {
      const [f, t] = await Promise.all([
        admin.from("fincas").select("nombre").eq("activa", true).order("nombre"),
        admin.from("trabajadores").select("codigo,nombre").eq("activo", true).order("nombre"),
      ]);
      return json({
        fincas: (f.data ?? []).map((x) => x.nombre), mayores: MAYORES, tareas: TAREAS,
        trabajadores: (t.data ?? []).map((x) => {
          const codigo = x.codigo ?? PREFIJO.exec(x.nombre)?.[1] ?? null;
          return nombres ? { codigo, nombre: x.nombre.replace(PREFIJO, "") } : { codigo };
        }),
      });
    }

    if (ruta === "/horas/resumen" || ruta === "/horas/registros") {
      const hoy = new Date();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const ok = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
      const desde = ok(url.searchParams.get("desde")) ?? iso(new Date(hoy.getTime() - 30 * 864e5));
      const hasta = ok(url.searchParams.get("hasta")) ?? iso(hoy);
      const q = (n: string) => (url.searchParams.get(n) ?? "").trim();
      const limpio = (s: string) => s.replace(/[%,()]/g, " ").trim();
      const fincaTxt = limpio(q("finca")), trabTxt = limpio(q("trabajador")), mayor = limpio(q("mayor")), tarea = limpio(q("tarea"));

      let fincaIds: string[] | null = null;
      if (fincaTxt) {
        const { data } = await admin.from("fincas").select("id").ilike("nombre", `%${fincaTxt}%`);
        fincaIds = (data ?? []).map((x) => x.id);
        if (!fincaIds.length) return json({ error: `No hay ninguna finca que coincida con «${fincaTxt}»`, fincas_disponibles: ((await admin.from("fincas").select("nombre")).data ?? []).map((x) => x.nombre) }, 404);
      }
      let trabIds: string[] | null = null;
      if (trabTxt) {
        const { data } = await admin.from("trabajadores").select("id").or(`nombre.ilike.%${trabTxt}%,codigo.ilike.%${trabTxt}%`);
        trabIds = (data ?? []).map((x) => x.id);
      }

      const filas: Parte[] = [];
      for (let a = 0; a < 100000; a += 1000) {
        let c = admin.from("partes_trabajo")
          .select("fecha,mayor,tipo_trabajo,actividad,num_trabajadores,horas_totales,horas_extra_totales,trabajador_id,trabajador_nombre,trabajadores(codigo,nombre),fincas(nombre)")
          .gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }).order("id").range(a, a + 999);
        if (fincaIds) c = c.in("finca_id", fincaIds);
        if (mayor) c = c.ilike("mayor", mayor);
        if (tarea) c = c.ilike("tipo_trabajo", `%${tarea}%`);
        if (trabTxt) c = c.or(`${trabIds?.length ? `trabajador_id.in.(${trabIds.join(",")}),` : ""}trabajador_nombre.ilike.%${trabTxt}%`);
        const { data, error } = await c;
        if (error) throw new Error(error.message);
        filas.push(...((data ?? []) as unknown as Parte[]));
        if ((data ?? []).length < 1000) break;
      }

      const per = (p: Parte) => {
        const bruto = p.trabajadores?.nombre ?? p.trabajador_nombre ?? (p.num_trabajadores > 1 ? `Sin nombre (${p.num_trabajadores} personas)` : "Sin nombre");
        const codigo = p.trabajadores?.codigo ?? PREFIJO.exec(bruto)?.[1] ?? null;
        const nombre = bruto.replace(PREFIJO, "");
        return { codigo, nombre: nombres ? nombre : (codigo ? `Trabajador ${codigo}` : "Trabajador sin código") };
      };
      const filtros = { desde, hasta, finca: fincaTxt || null, trabajador: trabTxt || null, mayor: mayor || null, tarea: tarea || null };

      if (ruta === "/horas/registros") {
        const limite = Math.min(300, Math.max(1, Number(q("limite")) || 100));
        return json({
          filtros, total_registros: filas.length, mostrando: Math.min(limite, filas.length),
          registros: filas.slice(0, limite).map((p) => ({ fecha: p.fecha, ...(({ codigo, nombre }) => ({ codigo, trabajador: nombre }))(per(p)), finca: p.fincas?.nombre ?? null, mayor: p.mayor, tarea: p.tipo_trabajo, observaciones: p.actividad, horas: r2(Number(p.horas_totales ?? 0)), horas_extra: r2(Number(p.horas_extra_totales ?? 0)) })),
        });
      }

      const agrupar = ["trabajador", "dia", "mes", "mayor", "tarea", "finca"].includes(q("agrupar")) ? q("agrupar") : "trabajador";
      const grupos = new Map<string, { clave: string; horas: number; extra: number; dias: Set<string>; registros: number }>();
      for (const p of filas) {
        const pp = per(p);
        const clave = agrupar === "trabajador" ? `${pp.codigo ? pp.codigo + " · " : ""}${pp.nombre}`
          : agrupar === "dia" ? p.fecha : agrupar === "mes" ? p.fecha.slice(0, 7) : agrupar === "mayor" ? p.mayor ?? "Sin clasificar"
          : agrupar === "tarea" ? p.tipo_trabajo ?? "Sin tarea" : p.fincas?.nombre ?? "Sin finca";
        const g = grupos.get(clave) ?? { clave, horas: 0, extra: 0, dias: new Set<string>(), registros: 0 };
        g.horas += Number(p.horas_totales ?? 0); g.extra += Number(p.horas_extra_totales ?? 0); g.dias.add(p.fecha); g.registros++;
        grupos.set(clave, g);
      }
      let tractorHoras: number | null = null;
      if (!trabTxt && !mayor && !tarea) {
        let qt = admin.from("horas_tractor").select("horas").gte("fecha", desde).lte("fecha", hasta);
        if (fincaIds) qt = qt.in("finca_id", fincaIds);
        tractorHoras = r2(((await qt).data ?? []).reduce((a, x) => a + Number(x.horas ?? 0), 0));
      }
      const lista = [...grupos.values()].sort((a, b) => (agrupar === "dia" || agrupar === "mes" ? a.clave.localeCompare(b.clave) : b.horas - a.horas));
      return json({
        filtros, agrupado_por: agrupar, total_horas: r2(filas.reduce((a, p) => a + Number(p.horas_totales ?? 0), 0)),
        total_horas_extra: r2(filas.reduce((a, p) => a + Number(p.horas_extra_totales ?? 0), 0)), total_registros: filas.length,
        horas_tractor_aparte: tractorHoras, nota_tractor: "Las horas de tractor son de la finca y el día; no se suman a las del personal.",
        grupos: lista.map((g) => ({ [agrupar]: g.clave, horas: r2(g.horas), horas_extra: r2(g.extra), dias: g.dias.size, registros: g.registros })),
      });
    }
    return json({ error: "Ruta no encontrada", rutas: ["/openapi.json", "/conjuntos", "/datos/{conjunto}", "/resumen/{conjunto}", "/catalogos", "/horas/resumen", "/horas/registros"] }, 404);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
