import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/demo/config";
import { aplicarAnulacion, aplicarCorreccion } from "@/lib/chat/correcciones";

const DESTINO: Record<string, string> = {
  registrar_parte: "partes_trabajo",
  registrar_cosecha: "cosechas",
  registrar_gasto: "gastos",
  crear_tarea: "tareas",
};

// Confirma o cancela una acción propuesta por el chat.
// El insert se hace con la sesión del usuario: RLS decide si puede escribir en esa finca.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (DEMO) {
    const { decision: d } = (await req.json()) as { decision: "confirmar" | "cancelar" };
    return NextResponse.json({ ok: true, estado: d === "confirmar" ? "confirmada" : "cancelada", demo: true });
  }
  const { decision } = (await req.json()) as { decision: "confirmar" | "cancelar" };
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Reclamo atómico: solo una petición pasa de 'pendiente' a otro estado (evita doble guardado)
  const nuevo = decision === "confirmar" ? "confirmada" : "cancelada";
  const { data: accion } = await db
    .from("acciones_pendientes")
    .update({ estado: nuevo, resuelta_at: new Date().toISOString() })
    .eq("id", id).eq("estado", "pendiente")
    .select("tipo,payload").maybeSingle();
  if (!accion) return NextResponse.json({ error: "La acción ya no está pendiente." }, { status: 409 });
  if (decision === "cancelar") return NextResponse.json({ ok: true, estado: "cancelada" });

  // Corregir o anular un registro existente (con comprobación de que no ha cambiado desde la propuesta)
  if (accion.tipo === "corregir_registro" || accion.tipo === "anular_registro") {
    const r = accion.tipo === "corregir_registro" ? await aplicarCorreccion(db, accion.payload) : await aplicarAnulacion(db, accion.payload);
    if (!r.ok) {
      await db.from("acciones_pendientes")
        .update(r.caducada ? { estado: "caducada", resuelta_at: new Date().toISOString() } : { estado: "pendiente", resuelta_at: null }).eq("id", id);
      return NextResponse.json({ error: r.error, caducada: !!r.caducada }, { status: r.caducada ? 409 : 400 });
    }
    await db.from("acciones_pendientes").update({ resultado_id: r.id }).eq("id", id);
    return NextResponse.json({ ok: true, estado: "confirmada", tabla: accion.payload.tabla, registroId: r.id });
  }

  const tabla = DESTINO[accion.tipo];
  const { data: reg, error } = await db.from(tabla).insert(accion.payload).select("id").single();
  if (error) {
    // Revertir para que el usuario pueda reintentar o cancelar
    await db.from("acciones_pendientes").update({ estado: "pendiente", resuelta_at: null }).eq("id", id);
    const dup = error.code === "23505";
    return NextResponse.json(
      { error: dup ? "Ya existe un registro idéntico (duplicado)." : `No se pudo guardar: ${error.message}` },
      { status: dup ? 409 : 400 },
    );
  }
  await db.from("acciones_pendientes").update({ resultado_id: reg.id }).eq("id", id);
  return NextResponse.json({ ok: true, estado: "confirmada", tabla, registroId: reg.id });
}
