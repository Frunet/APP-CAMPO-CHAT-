import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { DEMO, MSG_DEMO } from "@/lib/demo/config";
import { createClient } from "@/lib/supabase/server";
import { MAX_BYTES, TIPOS_PERMITIDOS, extension, firmaValida } from "@/lib/documentos/extraer";

export const maxDuration = 60;

// Sube un archivo original (inmutable) a Storage y crea su ficha. No extrae todavía.
export async function POST(req: Request) {
  if (DEMO) return NextResponse.json({ error: MSG_DEMO + " No se pueden subir ni descargar archivos." }, { status: 403 });
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const fd = await req.formData();
  const file = fd.get("archivo");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (file.size === 0 || file.size > MAX_BYTES)
    return NextResponse.json({ error: "El archivo debe pesar entre 1 byte y 15 MB." }, { status: 400 });

  const ext = extension(file.name);
  if (!TIPOS_PERMITIDOS[ext])
    return NextResponse.json({ error: "Formato no admitido. Usa PDF, XLS/XLSX, CSV, DOCX, JPG o PNG." }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (!firmaValida(ext, buf)) return NextResponse.json({ error: "El contenido no coincide con la extensión del archivo." }, { status: 400 });

  const sha = createHash("sha256").update(buf).digest("hex");
  const { data: dup } = await db.from("documentos").select("id,nombre").eq("sha256", sha).limit(1).maybeSingle();
  if (dup) return NextResponse.json({ error: `Este archivo ya está subido como «${dup.nombre}».`, duplicadoId: dup.id }, { status: 409 });

  // Nombre de almacenamiento sin caracteres peligrosos; el nombre original se conserva en la ficha
  const seguro = file.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${auth.user.id}/${randomUUID()}-${seguro}`;
  const { error: upErr } = await db.storage.from("documentos").upload(path, buf, { contentType: TIPOS_PERMITIDOS[ext].mime, upsert: false });
  if (upErr) return NextResponse.json({ error: "No se pudo guardar el archivo (¿permisos?)." }, { status: 403 });

  const str = (k: string) => { const v = fd.get(k); return typeof v === "string" && v ? v : null; };
  const { data, error } = await db.from("documentos").insert({
    nombre: file.name, mime: TIPOS_PERMITIDOS[ext].mime, tamano_bytes: file.size, storage_path: path, sha256: sha,
    finca_id: str("finca_id"), parcela_id: str("parcela_id"), campana_id: str("campana_id"),
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
