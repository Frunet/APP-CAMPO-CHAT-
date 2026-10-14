import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { construirInforme, leerFiltros } from "@/lib/informes";

/** Prepara el informe con la sesión del usuario (RLS) y los nombres legibles de los filtros. */
export async function prepararInforme(req: Request) {
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  const sp = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string>;
  const filtros = leerFiltros(sp);
  const [inf, f, p, c] = await Promise.all([
    construirInforme(db, filtros),
    filtros.finca ? db.from("fincas").select("nombre").eq("id", filtros.finca).maybeSingle() : null,
    filtros.parcela ? db.from("parcelas").select("codigo").eq("id", filtros.parcela).maybeSingle() : null,
    filtros.campana ? db.from("campanas").select("nombre").eq("id", filtros.campana).maybeSingle() : null,
  ]);
  return { inf, ctx: { finca: f?.data?.nombre ?? "Todas", parcela: p?.data?.codigo ?? "Todas", campana: c?.data?.nombre ?? "Todas" } };
}
