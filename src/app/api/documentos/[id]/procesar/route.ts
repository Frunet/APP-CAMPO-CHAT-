import { NextResponse } from "next/server";
import { DEMO, MSG_DEMO } from "@/lib/demo/config";
import { createClient } from "@/lib/supabase/server";
import { procesarDocumento } from "@/lib/documentos/extraer";

export const maxDuration = 120;

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  if (DEMO) return NextResponse.json({ error: MSG_DEMO + " No se pueden subir ni descargar archivos." }, { status: 403 });
  const { id } = await ctx.params;
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const r = await procesarDocumento(db, id);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
