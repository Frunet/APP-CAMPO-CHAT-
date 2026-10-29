import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEMO, MSG_DEMO } from "@/lib/demo/config";

/**
 * Deja constancia en la conversación de que se adjuntó un documento (y de lo que se leyó), para que el asistente
 * sepa de qué se habla y tenga su id. Solo escribe mensajes de chat; no importa ningún dato.
 */
export async function POST(req: Request) {
  if (DEMO) return NextResponse.json({ error: MSG_DEMO }, { status: 403 });
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { conversacionId, documentoId } = (await req.json()) as { conversacionId?: string; documentoId?: string };
  if (!documentoId || !/^[0-9a-f-]{36}$/i.test(documentoId)) return NextResponse.json({ error: "Documento no válido" }, { status: 400 });
  const { data: doc } = await db.from("documentos").select("id,nombre,estado,datos_extraidos").eq("id", documentoId).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });

  let convId = conversacionId;
  if (!convId) {
    const { data, error } = await db.from("chat_conversaciones").insert({ titulo: `📎 ${doc.nombre}`.slice(0, 60) }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    convId = data.id;
  }

  const ext = doc.datos_extraidos as { resumen?: string; registros?: { dudas?: string[]; finca_id?: string | null; numero_factura?: string | null }[]; mapeo_pendiente?: unknown; hoja_horas?: boolean } | null;
  const n = ext?.registros?.length ?? 0;
  const dudas = (ext?.registros ?? []).filter((r) => (r.dudas ?? []).length).length;
  const usuario = `Adjunto el documento «${doc.nombre}» (id ${doc.id}).`;
  const facturas = (ext?.registros ?? []).filter((r) => r.numero_factura != null);
  const sinFinca = facturas.filter((r) => !r.finca_id).length;
  const asistente = ext?.hoja_horas
    ? `${ext.resumen ?? `He leído la hoja de horas «${doc.nombre}».`} Elige a qué finca va cada una en la tarjeta y pulsa «Importar»: no se guarda nada hasta entonces.${dudas ? ` Hay ${dudas} línea(s) con avisos.` : ""}`
    : ext?.mapeo_pendiente
    ? `He guardado el original de «${doc.nombre}». Parece un resumen de facturas, pero no he podido identificar todas las columnas: indícamelas en la tarjeta y lo leo sin más.`
    : facturas.length
    ? `He leído «${doc.nombre}»: ${facturas.length} línea(s) de factura${dudas ? `, ${dudas} con dudas` : ""}. ${sinFinca ? `${sinFinca} no tienen finca identificada: elígela en cada fila (o añade el identificador en Maestros → Lectura de facturas). ` : "Todas tienen finca asignada. "}` +
      "No se ha importado nada: revisa la tarjeta, marca las filas y pulsa «Importar»."
    : ext
    ? `He guardado el original y leído «${doc.nombre}»: ${n} fila(s) detectada(s)${dudas ? `, ${dudas} con dudas` : ""}.${ext.resumen ? ` ${ext.resumen}` : ""} ` +
      "No se ha importado nada: hay que revisar y marcar las filas en la tarjeta de revisión y pulsar «Importar»."
    : `He guardado el original de «${doc.nombre}», pero no se ha podido leer todavía (estado: ${doc.estado}). Se puede reintentar desde la tarjeta.`;

  const base = Date.now();
  const { error } = await db.from("chat_mensajes").insert([
    { conversacion_id: convId, rol: "user", contenido: usuario, texto: usuario, created_at: new Date(base).toISOString() },
    { conversacion_id: convId, rol: "assistant", contenido: [{ type: "text", text: asistente }], texto: asistente, created_at: new Date(base + 1).toISOString() },
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db.from("chat_conversaciones").update({ updated_at: new Date().toISOString() }).eq("id", convId);
  return NextResponse.json({ conversacionId: convId, texto: asistente });
}
