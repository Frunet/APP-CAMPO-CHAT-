import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CAP, datosCosechas, datosGastos, datosTrabajo, leerFM, type FM } from "@/lib/modulos";
import { construirVista, leerConsulta, tablaComparativa, tablaConsolidada, tablaDetalle, pct, valorDe, filasCuenta } from "@/lib/resultados";
import { CATEGORIAS_CG, imputacionCampana } from "@/lib/costes-generales";
import { excelDeDoc, pdfDeDoc, type Doc } from "@/lib/informes-export";

export const maxDuration = 120;

const num = (n: number, d = 2) => n.toLocaleString("es-ES", { maximumFractionDigits: d });
const dmy = (iso: string) => iso.split("-").reverse().join("/");

// Descarga (Excel o PDF) de los datos de Trabajo, Cosechas o Gastos con los mismos filtros que la pantalla.
// Se consulta con la sesión del usuario: solo salen las fincas que tiene autorizadas.
export async function GET(req: Request, ctx: { params: Promise<{ modulo: string }> }) {
  const { modulo } = await ctx.params;
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  if (modulo === "resultados") return cuentaResultados(db, url);
  if (modulo === "diario") return diarioFincas(db, url);
  if (modulo === "costes-generales") return costesGenerales(db, auth.user.id, url);
  const formato = url.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";
  const f: FM = leerFM(Object.fromEntries(url.searchParams) as Record<string, string>);

  // Nombres legibles de los filtros para la cabecera
  const [fi, pa, ca] = await Promise.all([
    f.finca ? db.from("fincas").select("nombre").eq("id", f.finca).maybeSingle() : null,
    f.parcela ? db.from("parcelas").select("codigo").eq("id", f.parcela).maybeSingle() : null,
    f.campana ? db.from("campanas").select("nombre").eq("id", f.campana).maybeSingle() : null,
  ]);
  const periodo = f.desde || f.hasta ? `${f.desde ? dmy(f.desde) : "inicio"} a ${f.hasta ? dmy(f.hasta) : "hoy"}` : "Todo el histórico";
  const cabecera: (string | number)[][] = [
    ["Periodo", periodo], ["Finca", fi?.data?.nombre ?? "Todas"], ["Parcela", pa?.data?.codigo ?? "Todas"],
    ...(modulo === "trabajo" ? [] : [["Campaña", ca?.data?.nombre ?? "Todas"]]),
  ];
  const limite = (n: boolean) => (n ? [`Se superó el límite de ${CAP} registros: la descarga está incompleta. Acota las fechas.`] : []);

  let doc: Doc;
  if (modulo === "trabajo") {
    const d = await datosTrabajo(db, f);
    if (d.error) return NextResponse.json({ error: d.error }, { status: 500 });
    doc = {
      titulo: "Partes de trabajo", horizontal: true, maxFilasPdf: 3000, tablas: [d.tabla],
      resumen: [...cabecera, ["Partes registrados", d.n], ["Horas totales", num(d.horas)], ["Coste laboral (€)", d.sinTarifa ? `Parcial: ${num(d.coste)} (hay partes sin tarifa)` : num(d.coste)]],
      notas: [...(d.sinTarifa ? [`${d.sinTarifa} parte(s) sin tarifa: el coste laboral es parcial.`] : []), ...limite(d.truncado)],
    };
  } else if (modulo === "cosechas") {
    const d = await datosCosechas(db, f);
    if (d.error) return NextResponse.json({ error: d.error }, { status: 500 });
    doc = {
      titulo: "Cosechas y producción", horizontal: true, maxFilasPdf: 3000,
      tablas: [d.tabla, { titulo: "Total por parcela", columnas: ["Finca · parcela", "Kg", "% del total"], filas: d.porParcela.map((p) => [p.k, p.v, d.kg ? Math.round((p.v / d.kg) * 1000) / 10 : 0]) }],
      resumen: [...cabecera, ["Registros", d.n], ["Kilogramos totales", num(d.kg)]], notas: limite(d.truncado),
    };
  } else if (modulo === "gastos") {
    const d = await datosGastos(db, f);
    if (d.error) return NextResponse.json({ error: d.error }, { status: 500 });
    const notas = [...limite(d.truncado)];
    if (d.mixta) notas.push(`Gastos en varias monedas (${d.monedas.join(", ")}): no se suman.`);
    if (!d.ha) notas.push("Falta la superficie (ha) del ámbito consultado: no se calcula el coste por hectárea.");
    if (!d.kg) notas.push("No hay cosechas en el filtro: no se calcula el coste por kilogramo.");
    doc = {
      titulo: "Gastos y costes", horizontal: true, maxFilasPdf: 3000,
      tablas: [d.tabla, { titulo: "Por categoría (registrado)", columnas: ["Categoría", `Importe (${d.moneda})`], filas: d.porCategoria.map((c) => [c.nombre, c.v]) }],
      resumen: [
        ...cabecera, ["Gasto registrado (real)", d.mixta ? "—" : `${num(d.total)} ${d.moneda}`],
        ["Coste por hectárea", d.costeHa == null ? "No calculable" : num(d.costeHa)], ["Coste por kilogramo", d.costeKg == null ? "No calculable" : num(d.costeKg, 3)],
        ["Presupuestos/estimaciones (no contabilizados)", `${d.noContabilizado.n} registros · ${num(d.noContabilizado.importe)}`],
        ["Mano de obra según partes (€, aparte)", num(d.laboral)], ["Gastos registrados sin justificar", d.sinJustificar],
      ],
      notas,
    };
  } else {
    return NextResponse.json({ error: "Módulo no válido" }, { status: 404 });
  }

  const nombre = `${modulo}_${new Date().toISOString().slice(0, 10)}`;
  if (formato === "pdf") {
    return new NextResponse(new Uint8Array(await pdfDeDoc(doc)), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}.pdf"` },
    });
  }
  return new NextResponse(new Uint8Array(excelDeDoc(doc)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}.xlsx"`,
    },
  });
}

// Costes generales imputados a una campaña (solo administrador)
async function costesGenerales(db: Awaited<ReturnType<typeof createClient>>, uid: string, url: URL) {
  const { data: perfil } = await db.from("profiles").select("rol").eq("id", uid).maybeSingle();
  if (perfil?.rol !== "administrador") return NextResponse.json({ error: "Solo el administrador puede descargar los costes generales" }, { status: 403 });
  const campana = url.searchParams.get("campana") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(campana)) return NextResponse.json({ error: "Falta la campaña" }, { status: 400 });
  const r = await imputacionCampana(db, campana);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  const nombreCat = Object.fromEntries(CATEGORIAS_CG), nombreFinca = new Map(r.fincas.map((f) => [f.id, f.nombre]));
  const porFinca = new Map<string, Map<string, number>>();
  r.lineas.forEach((l) => { const m = porFinca.get(l.finca_id) ?? new Map<string, number>(); m.set(l.coste.categoria, (m.get(l.coste.categoria) ?? 0) + l.importe); porFinca.set(l.finca_id, m); });
  const tot = (m?: Map<string, number>) => Math.round([...(m?.values() ?? [])].reduce((a, b) => a + b, 0) * 100) / 100;
  const doc: Doc = {
    titulo: `Costes generales · ${r.camp.nombre}`, horizontal: true, maxFilasPdf: 3000,
    tablas: [
      { titulo: "Por finca y categoría", columnas: ["Finca", ...CATEGORIAS_CG.map(([, t]) => t), "Total"],
        filas: [...r.fincas.map((f) => [f.nombre, ...CATEGORIAS_CG.map(([k]) => porFinca.get(f.id)?.get(k) ?? 0), tot(porFinca.get(f.id))]),
          ["Total imputado", ...CATEGORIAS_CG.map(([k]) => Math.round(r.lineas.filter((l) => l.coste.categoria === k).reduce((a, l) => a + l.importe, 0) * 100) / 100), r.total]] },
      { titulo: "Detalle", columnas: ["Finca", "Concepto", "Categoría", "Importe imputado", "Periodicidad", "Importe del coste", "Reparto"],
        filas: r.lineas.map((l) => [nombreFinca.get(l.finca_id) ?? "", l.coste.concepto, nombreCat[l.coste.categoria] ?? l.coste.categoria, l.importe, l.coste.periodicidad, l.coste.importe, l.coste.finca_id ? "Propio de la finca" : l.coste.reparto === "iguales" ? "General · partes iguales" : "General · por hectáreas"]) },
    ],
    resumen: [["Campaña", r.camp.nombre], ["Periodo", `${dmy(r.ini)} a ${dmy(r.fin)}`], ["Total imputado (€)", num(r.total)], ["Sin repartir (€)", num(r.sinRepartir.reduce((a, x) => a + x.importe, 0))]],
    notas: [`Devengo diario (importe anual ÷ 365) dentro del periodo de la campaña${r.camp.fecha_fin ? "" : "; campaña abierta: hasta hoy"}.`, ...r.sinRepartir.map((x) => `Sin repartir: ${x.coste.concepto} (${num(x.importe)}): ${x.motivo}`)],
  };
  const nombre = `costes-generales_${new Date().toISOString().slice(0, 10)}`;
  if (url.searchParams.get("formato") === "pdf")
    return new NextResponse(new Uint8Array(await pdfDeDoc(doc)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}.pdf"` } });
  return new NextResponse(new Uint8Array(excelDeDoc(doc)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${nombre}.xlsx"` } });
}

// Cuenta de resultados (consolidada o comparativa) con el mismo periodo y fincas que la pantalla; la RLS limita a las fincas del usuario
async function cuentaResultados(db: Awaited<ReturnType<typeof createClient>>, url: URL) {
  const [{ data: fs }, { data: cs }] = await Promise.all([
    db.from("fincas").select("id,nombre").eq("activa", true).order("nombre"),
    db.from("campanas").select("id,nombre,fecha_inicio,fecha_fin").order("fecha_inicio", { ascending: false }),
  ]);
  const c = leerConsulta(Object.fromEntries(url.searchParams) as Record<string, string>, (fs ?? []) as any[], (cs ?? []) as any[]);
  if (!c.fincas.length) return NextResponse.json({ error: "No tienes fincas asignadas" }, { status: 403 });
  const v = await construirVista(db, c.fincas, c.periodo, c.comparativa);
  const nf = new Map(c.fincas.map((f) => [f.id, f.nombre]));
  const filas = filasCuenta(v.actual), ventas = valorDe(filas, "ventas");
  const doc: Doc = {
    titulo: "Cuenta de resultados", horizontal: true, maxFilasPdf: 3000,
    tablas: [c.comparativa ? tablaComparativa(v) : tablaConsolidada(v), tablaDetalle(v, nf)],
    resumen: [
      ["Periodo", `${c.periodo.etiqueta} (${dmy(c.periodo.desde)} a ${dmy(c.periodo.hasta)})`], ["Fincas", c.fincas.map((f) => f.nombre).join(", ")],
      ["Ventas (€)", num(ventas)], ["Margen bruto (€)", `${num(valorDe(filas, "margen_bruto"))}${pct(valorDe(filas, "margen_bruto"), ventas) == null ? "" : ` (${num(pct(valorDe(filas, "margen_bruto"), ventas)!, 1)} % s/ventas)`}`],
      ["Resultado (€)", `${num(valorDe(filas, "resultado"))}${pct(valorDe(filas, "resultado"), ventas) == null ? "" : ` (${num(pct(valorDe(filas, "resultado"), ventas)!, 1)} % s/ventas)`}`],
    ],
    notas: ["Importes en euros sin IVA, calculados en el momento de la descarga. Solo gastos «registrados» en euros; los partes sin tarifa no suman.", "Los costes generales se prorratean por días a cada finca."],
  };
  const nombre = `cuenta-resultados_${new Date().toISOString().slice(0, 10)}`;
  if (url.searchParams.get("formato") === "pdf")
    return new NextResponse(new Uint8Array(await pdfDeDoc(doc)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}.pdf"` } });
  return new NextResponse(new Uint8Array(excelDeDoc(doc)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${nombre}.xlsx"` } });
}

// Diario de novedades (con las fincas que la RLS deja ver al usuario)
async function diarioFincas(db: Awaited<ReturnType<typeof createClient>>, url: URL) {
  const f = (k: string) => { const v = url.searchParams.get(k); return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null; };
  const d = (k: string) => { const v = url.searchParams.get(k); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
  let q = db.from("diario_fincas").select("num,fecha,tipo,tema,texto,fincas(nombre),parcelas(codigo),autor_nombre").eq("activa", true).order("fecha", { ascending: false }).limit(5000);
  const finca = f("finca"); if (finca) q = q.eq("finca_id", finca);
  const desde = d("desde"), hasta = d("hasta"); if (desde) q = q.gte("fecha", desde); if (hasta) q = q.lte("fecha", hasta);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const filas = (data ?? []) as any[];
  const doc: Doc = {
    titulo: "Diario de fincas", horizontal: true, maxFilasPdf: 3000,
    tablas: [{ titulo: "Novedades", columnas: ["Nº", "Fecha", "Finca", "Parcela", "Tipo", "Tema", "Novedad", "Anotada por"],
      filas: filas.map((r) => ["D" + r.num, dmy(r.fecha), r.fincas?.nombre ?? "", r.parcelas?.codigo ?? "", r.tipo, r.tema ?? "", r.texto, r.autor_nombre ?? ""]) }],
    resumen: [["Periodo", desde || hasta ? `${desde ? dmy(desde) : "inicio"} a ${hasta ? dmy(hasta) : "hoy"}` : "Todo el histórico"], ["Anotaciones", filas.length]], notas: [],
  };
  const nombre = `diario-fincas_${new Date().toISOString().slice(0, 10)}`;
  if (url.searchParams.get("formato") === "pdf")
    return new NextResponse(new Uint8Array(await pdfDeDoc(doc)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}.pdf"` } });
  return new NextResponse(new Uint8Array(excelDeDoc(doc)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${nombre}.xlsx"` } });
}
