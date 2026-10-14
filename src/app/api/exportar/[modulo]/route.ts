import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CAP, datosCosechas, datosGastos, datosTrabajo, leerFM, type FM } from "@/lib/modulos";
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
