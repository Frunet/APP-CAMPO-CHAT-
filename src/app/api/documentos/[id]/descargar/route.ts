import { NextResponse } from "next/server";
import { DEMO, MSG_DEMO } from "@/lib/demo/config";
import { createClient } from "@/lib/supabase/server";

// Descarga el original: la ficha debe ser visible para el usuario (RLS) y la URL firmada dura 60 s.
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  if (DEMO) return NextResponse.json({ error: MSG_DEMO + " No se pueden subir ni descargar archivos." }, { status: 403 });
  const { id } = await ctx.params;
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { data: doc } = await db.from("documentos").select("nombre,storage_path").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const { data, error } = await db.storage.from("documentos").createSignedUrl(doc.storage_path, 60, { download: doc.nombre });
  if (error || !data) return NextResponse.json({ error: "No se pudo generar la descarga" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
