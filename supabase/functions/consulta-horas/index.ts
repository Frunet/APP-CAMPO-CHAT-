import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Consulta de horas de solo lectura para sistemas externos (p. ej. un GPT de ChatGPT con «Acciones»).
 * - Autenticación propia con una clave (Authorization: Bearer <clave> o X-API-Key); en la base solo se guarda su hash (tabla api_consulta).
 * - Solo lectura. Sin tarifas ni costes. Si la clave tiene expone_nombres = false, solo devuelve códigos de trabajador.
 * Rutas (tras /functions/v1/consulta-horas): GET /openapi.json (pública), /catalogos, /horas/resumen, /horas/registros
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

function especificacion(base: string) {
  const filtros = [
    { name: "desde", in: "query", schema: { type: "string", format: "date" }, description: "Fecha inicial (AAAA-MM-DD). Por defecto, hace 30 días." },
    { name: "hasta", in: "query", schema: { type: "string", format: "date" }, description: "Fecha final (AAAA-MM-DD). Por defecto, hoy." },
    { name: "finca", in: "query", schema: { type: "string" }, description: "Nombre (o parte) de la finca, p. ej. 'Rio Velez'." },
    { name: "trabajador", in: "query", schema: { type: "string" }, description: "Código o nombre (o parte) del trabajador, p. ej. '3008'." },
    { name: "mayor", in: "query", schema: { type: "string", enum: MAYORES }, description: "Agrupación de tareas." },
    { name: "tarea", in: "query", schema: { type: "string" }, description: "Tarea concreta, p. ej. 'Poda'." },
  ];
  return {
    openapi: "3.1.0",
    info: { title: "Horas de campo Frunet (solo lectura)", version: "1.0.0", description: "Consulta las horas registradas en la app de campo de Frunet. Solo lectura, sin costes." },
    servers: [{ url: base }],
    paths: {
      "/catalogos": { get: { operationId: "obtenerCatalogos", summary: "Fincas, trabajadores, mayores y tareas disponibles", responses: { "200": { description: "OK" } } } },
      "/horas/resumen": {
        get: {
          operationId: "resumenHoras", summary: "Totales de horas agrupados (por trabajador, día, mes, mayor, tarea o finca)",
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
  const { data: k } = await admin.from("api_consulta").select("id,expone_nombres").eq("clave_hash", await sha256(clave)).eq("activa", true).maybeSingle();
  if (!k) return json({ error: "Clave no válida" }, 401);
  admin.from("api_consulta").update({ ultimo_uso: new Date().toISOString() }).eq("id", k.id).then(() => {});
  const nombres = !!k.expone_nombres;

  try {
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

      const persona = (p: Parte) => {
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
          registros: filas.slice(0, limite).map((p) => ({ fecha: p.fecha, ...(({ codigo, nombre }) => ({ codigo, trabajador: nombre }))(persona(p)), finca: p.fincas?.nombre ?? null, mayor: p.mayor, tarea: p.tipo_trabajo, observaciones: p.actividad, horas: r2(Number(p.horas_totales ?? 0)), horas_extra: r2(Number(p.horas_extra_totales ?? 0)) })),
        });
      }

      const agrupar = ["trabajador", "dia", "mes", "mayor", "tarea", "finca"].includes(q("agrupar")) ? q("agrupar") : "trabajador";
      const grupos = new Map<string, { clave: string; horas: number; extra: number; dias: Set<string>; registros: number }>();
      for (const p of filas) {
        const per = persona(p);
        const clave = agrupar === "trabajador" ? `${per.codigo ? per.codigo + " · " : ""}${per.nombre}`
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
    return json({ error: "Ruta no encontrada", rutas: ["/openapi.json", "/catalogos", "/horas/resumen", "/horas/registros"] }, 404);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
