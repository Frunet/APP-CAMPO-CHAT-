import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { esError, resolver } from "./resolver";

/**
 * Descargas (Excel / PDF) desde el chat: ya no hay pantallas de Trabajo, Cosechas, Gastos, Diario ni Informes,
 * así que el asistente da el enlace al fichero. Las rutas de descarga consultan con la sesión de la persona (RLS).
 */
type Ctx = { db: SupabaseClient; userId: string; conversacionId: string };

const MODULOS = ["trabajo", "cosechas", "gastos", "diario", "informe", "resultados", "nominas"] as const;

export const herramientasDescargas: Anthropic.Tool[] = [
  {
    name: "preparar_descarga",
    description:
      "Devuelve el enlace para descargar en Excel o PDF un listado completo: trabajo (partes y horas), cosechas, gastos, diario (diario de fincas), " +
      "informe (informe de producción y rendimiento), resultados (cuenta de resultados; responsables/administradores) o nominas (horas y coste por trabajador; responsables/administradores). " +
      "Úsalo SOLO cuando la persona pida expresamente un archivo (Excel, PDF, «descargar», «pásame el fichero»). Nunca lo uses para responder una pregunta: eso se contesta en el chat con las herramientas de consulta. " +
      "Da el enlace en formato [texto](url) tal cual lo devuelve, sin cambiarlo.",
    input_schema: {
      type: "object",
      properties: {
        modulo: { type: "string", enum: [...MODULOS] },
        formato: { type: "string", enum: ["xlsx", "pdf"], description: "Por defecto xlsx (Excel)" },
        desde: { type: "string", description: "Fecha inicial YYYY-MM-DD (opcional)" },
        hasta: { type: "string", description: "Fecha final YYYY-MM-DD (opcional)" },
        finca: { type: "string", description: "Código o nombre de la finca (opcional; sin ella, todas las autorizadas)" },
        parcela: { type: "string", description: "Código o nombre de la parcela (opcional; solo trabajo, cosechas, gastos, informe)" },
      },
      required: ["modulo"],
    },
  },
];

const fechaOk = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

export async function prepararDescarga(db: SupabaseClient, _ctx: Ctx, input: Record<string, any>) {
  const modulo = String(input.modulo ?? "");
  if (!(MODULOS as readonly string[]).includes(modulo)) return { error: `Módulo no válido. Opciones: ${MODULOS.join(", ")}.` };
  const formato = input.formato === "pdf" ? "pdf" : "xlsx";
  const desde = fechaOk(input.desde), hasta = fechaOk(input.hasta);
  if ((input.desde && !desde) || (input.hasta && !hasta)) return { error: "Las fechas deben ser YYYY-MM-DD. Pregunta el periodo." };
  const ref = await resolver(db, input.finca, input.parcela);
  if (esError(ref)) return ref;

  const q = new URLSearchParams();
  let ruta: string;
  if (modulo === "informe") {
    ruta = `/api/informes/${formato === "pdf" ? "pdf" : "excel"}`;
  } else {
    ruta = `/api/exportar/${modulo}`;
    q.set("formato", formato);
  }
  if (ref.finca_id) q.set("finca", ref.finca_id);
  if (ref.parcela_id && ["trabajo", "cosechas", "gastos", "informe"].includes(modulo)) q.set("parcela", ref.parcela_id);
  if (modulo === "resultados" || modulo === "nominas") {
    q.set("tipo", "rango");
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    if (!desde && !hasta) { q.delete("tipo"); } // sin fechas: el valor por defecto de cada informe (año / mes en curso)
  } else {
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
  }
  const url = `${ruta}?${q.toString()}`;
  const nombre = { trabajo: "Partes de trabajo", cosechas: "Cosechas", gastos: "Gastos y costes", diario: "Diario de fincas", informe: "Informe de producción", resultados: "Cuenta de resultados", nominas: "Nóminas" }[modulo];
  return {
    enlace: `[${nombre} (${formato === "pdf" ? "PDF" : "Excel"})](${url})`,
    periodo: desde || hasta ? `${desde ?? "inicio"} a ${hasta ?? "hoy"}` : modulo === "informe" ? "mes en curso" : modulo === "resultados" ? "año en curso" : modulo === "nominas" ? "mes en curso" : "todo el histórico",
    finca: ref.finca ?? "todas las fincas autorizadas",
    instruccion: "Da el enlace tal cual (formato [texto](url)) y di en una frase qué contiene. No repitas cifras que no hayas consultado.",
  };
}
