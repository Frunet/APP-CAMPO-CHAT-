import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ejecutarAvisos } from "@/lib/avisos/motor";
import { DEMO } from "@/lib/demo/config";

export const maxDuration = 300;

// Llamado por el planificador (Vercel Cron, pg_cron o similar) con `Authorization: Bearer $CRON_SECRET`.
// Funciona aunque nadie tenga la aplicación abierta.
export async function GET(req: Request) {
  if (DEMO) return NextResponse.json({ demo: true });
  const secreto = process.env.CRON_SECRET;
  const recibido = req.headers.get("authorization") ?? "";
  const esperado = `Bearer ${secreto}`;
  const ok = !!secreto && recibido.length === esperado.length && timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    return NextResponse.json(await ejecutarAvisos(createServiceClient()));
  } catch (e) {
    console.error("cron avisos", e);
    return NextResponse.json({ error: "Fallo en la ejecución" }, { status: 500 });
  }
}
