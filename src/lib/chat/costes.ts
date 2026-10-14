import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIAS_CG, imputacionCampana } from "@/lib/costes-generales";
import { esError, resolver } from "./resolver";

/** Consulta (solo lectura, solo administrador) de los costes generales imputados a una campaña. Las altas se hacen en Maestros. */
type Ctx = { db: SupabaseClient; userId: string; conversacionId: string };

export const herramientasCostes: Anthropic.Tool[] = [
  {
    name: "consultar_costes_generales",
    description:
      "Solo administrador. Devuelve los costes generales (personal fijo, amortizaciones, gastos financieros, seguros…) imputados a una campaña, por finca y categoría, " +
      "más lo que no se pudo repartir. No da de alta nada: los costes se gestionan en Maestros → Costes generales. Sin campaña usa la más reciente.",
    input_schema: { type: "object", properties: { campana: { type: "string", description: "nombre de la campaña" }, finca: { type: "string" } } },
  },
];

export async function consultarCostesGenerales(i: any, ctx: Ctx): Promise<unknown> {
  const { data: p } = await ctx.db.from("profiles").select("rol").eq("id", ctx.userId).maybeSingle();
  if (p?.rol !== "administrador") return { error: "Los costes generales solo los puede consultar el administrador." };
  const { data: camps } = await ctx.db.from("campanas").select("id,nombre").order("fecha_inicio", { ascending: false });
  const lista = (camps ?? []) as { id: string; nombre: string }[];
  if (!lista.length) return { error: "No hay campañas creadas (se crean en Maestros)." };
  const nombre = String(i?.campana ?? "").trim().toLowerCase();
  const camp = nombre ? lista.find((c) => c.nombre.toLowerCase().includes(nombre)) : lista[0];
  if (!camp) return { error: `No encuentro la campaña «${i.campana}». Campañas: ${lista.map((c) => c.nombre).join(", ")}.` };
  const ref = await resolver(ctx.db, i?.finca);
  if (esError(ref)) return ref;
  const r = await imputacionCampana(ctx.db, camp.id, ref.finca_id ?? undefined);
  if ("error" in r) return r;
  const nf = new Map(r.fincas.map((f) => [f.id, f.nombre])), nc = Object.fromEntries(CATEGORIAS_CG);
  const por: Record<string, Record<string, number>> = {};
  r.lineas.forEach((l) => { const f = nf.get(l.finca_id) ?? l.finca_id; por[f] ??= {}; const c = nc[l.coste.categoria]; por[f][c] = Math.round(((por[f][c] ?? 0) + l.importe) * 100) / 100; });
  return {
    campana: camp.nombre, periodo: `${r.ini} a ${r.fin}`, total_imputado_eur: r.total, por_finca_y_categoria: por,
    sin_repartir: r.sinRepartir.map((x) => ({ concepto: x.coste.concepto, importe_eur: x.importe, motivo: x.motivo })),
    nota: "Devengo diario (anual ÷ 365) dentro del periodo de la campaña.",
  };
}
