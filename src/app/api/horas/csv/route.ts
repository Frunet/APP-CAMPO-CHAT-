import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TAREAS_HORAS } from "@/lib/horas";

/** CSV de las horas con los mismos filtros que la pantalla (desde, hasta, trabajador, tarea). Se consulta con la sesión de la persona (RLS). */
export async function GET(req: Request) {
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { data: perfil } = await db.from("profiles").select("rol").eq("id", auth.user.id).maybeSingle();
  const verCoste = perfil?.rol === "administrador" || perfil?.rol === "responsable";

  const p = new URL(req.url).searchParams;
  const dia = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(p.get(k) ?? "") ? p.get(k)! : "");
  const trab = /^[0-9a-f-]{36}$/i.test(p.get("trabajador") ?? "") ? p.get("trabajador")! : "";
  const tarea = TAREAS_HORAS.includes((p.get("tarea") ?? "") as never) ? p.get("tarea")! : "";

  let q = db.from("partes_trabajo")
    .select("fecha,horas_totales,horas_extra_totales,coste_total,tipo_trabajo,actividad,trabajador_nombre,trabajadores(codigo,nombre),fincas(nombre)")
    .order("fecha", { ascending: false }).limit(20000);
  if (dia("desde")) q = q.gte("fecha", dia("desde"));
  if (dia("hasta")) q = q.lte("fecha", dia("hasta"));
  if (trab) q = q.eq("trabajador_id", trab);
  if (tarea) q = q.eq("tipo_trabajo", tarea);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const esp = (n: unknown) => (n == null ? "" : String(Number(n)).replace(".", ","));
  const celda = (v: unknown) => { const t = String(v ?? ""); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const cab = ["Fecha", "Código", "Trabajador", "Finca", "Tarea", "Observaciones", "Horas", "Horas extra", ...(verCoste ? ["Coste (€)"] : [])];
  const filas = ((data ?? []) as any[]).map((r) => [
    r.fecha.split("-").reverse().join("/"), r.trabajadores?.codigo ?? "", r.trabajadores?.nombre ?? r.trabajador_nombre ?? "", r.fincas?.nombre ?? "",
    r.tipo_trabajo ?? "", r.actividad ?? "", esp(r.horas_totales), esp(r.horas_extra_totales), ...(verCoste ? [esp(r.coste_total)] : []),
  ]);
  const csv = "﻿" + [cab, ...filas].map((f) => f.map(celda).join(";")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="horas.csv"' } });
}
