import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/demo/config";
import { aplicarAnulacion, aplicarCorreccion } from "@/lib/chat/correcciones";
import { aplicarRecepcion } from "@/lib/chat/documentos";
import { aplicarTarea } from "@/lib/chat/tareas";
import { aplicarMemoria } from "@/lib/chat/memoria";
import { aplicarDiario } from "@/lib/chat/diario";
import { aplicarMaestro } from "@/lib/chat/maestros";

const DESTINO: Record<string, string> = {
  registrar_parte: "partes_trabajo",
  registrar_cosecha: "cosechas",
  registrar_gasto: "gastos",
  crear_tarea: "tareas",
  crear_documento_esperado: "documentos_esperados",
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

  // Asignar (día / semana / pendiente) o completar una tarea existente
  if (accion.tipo === "asignar_tarea" || accion.tipo === "completar_tarea") {
    const r = await aplicarTarea(db, accion.tipo, accion.payload);
    if (!r.ok) {
      await db.from("acciones_pendientes").update({ estado: "pendiente", resuelta_at: null }).eq("id", id);
      return NextResponse.json({ error: r.error }, { status: 400 });
    }
    await db.from("acciones_pendientes").update({ resultado_id: r.id }).eq("id", id);
    return NextResponse.json({ ok: true, estado: "confirmada", tabla: "tareas", registroId: r.id });
  }

  // Maestros por el chat: alta, modificación, baja o reactivación
  if (accion.tipo === "cambiar_maestro") {
    const r = await aplicarMaestro(db, accion.payload, auth.user.id);
    if (!r.ok) {
      await db.from("acciones_pendientes").update({ estado: "pendiente", resuelta_at: null }).eq("id", id);
      return NextResponse.json({ error: r.error }, { status: 400 });
    }
    await db.from("acciones_pendientes").update({ resultado_id: r.id }).eq("id", id);
    return NextResponse.json({ ok: true, estado: "confirmada", tabla: accion.payload.tabla, registroId: r.id });
  }

  // Diario de la finca: anotar una novedad o retirarla
  if (accion.tipo === "registrar_novedad" || accion.tipo === "retirar_novedad") {
    const r = await aplicarDiario(db, accion.tipo, accion.payload, auth.user.id);
    if (!r.ok) {
      await db.from("acciones_pendientes").update({ estado: "pendiente", resuelta_at: null }).eq("id", id);
      return NextResponse.json({ error: r.error }, { status: 400 });
    }
    await db.from("acciones_pendientes").update({ resultado_id: r.id }).eq("id", id);
    return NextResponse.json({ ok: true, estado: "confirmada", tabla: "diario_fincas", registroId: r.id });
  }

  // Memoria de la empresa: guardar una decisión o darla de baja
  if (accion.tipo === "guardar_memoria" || accion.tipo === "olvidar_memoria") {
    const r = await aplicarMemoria(db, accion.tipo, accion.payload, auth.user.id);
    if (!r.ok) {
      await db.from("acciones_pendientes").update({ estado: "pendiente", resuelta_at: null }).eq("id", id);
      return NextResponse.json({ error: r.error }, { status: 400 });
    }
    await db.from("acciones_pendientes").update({ resultado_id: r.id }).eq("id", id);
    return NextResponse.json({ ok: true, estado: "confirmada", tabla: "memoria_chat", registroId: r.id });
  }

  // Marcar como recibido un documento esperado
  if (accion.tipo === "recibir_documento_esperado") {
    const r = await aplicarRecepcion(db, accion.payload);
    if (!r.ok) {
      await db.from("acciones_pendientes").update({ estado: "pendiente", resuelta_at: null }).eq("id", id);
      return NextResponse.json({ error: r.error }, { status: 400 });
    }
    await db.from("acciones_pendientes").update({ resultado_id: r.id }).eq("id", id);
    return NextResponse.json({ ok: true, estado: "confirmada", tabla: "documentos_esperados", registroId: r.id });
  }

  // Parte con una línea por trabajador: se guardan todas a la vez (o ninguna)
  if (accion.tipo === "registrar_parte_lineas") {
    const { comun, lineas } = accion.payload as { comun: Record<string, unknown>; lineas: { trabajador_id: string | null; trabajador_nombre: string | null; horas: number; horas_extra: number }[] };
    const filas = lineas.map((l) => ({
      ...comun, trabajador_id: l.trabajador_id, trabajador_nombre: l.trabajador_nombre, num_trabajadores: 1,
      horas_por_trabajador: l.horas, horas_extra_por_trabajador: l.horas_extra,
    }));
    const { data: regs, error: e2 } = await db.from("partes_trabajo").insert(filas).select("id");
    if (e2) {
      await db.from("acciones_pendientes").update({ estado: "pendiente", resuelta_at: null }).eq("id", id);
      const dup = e2.code === "23505";
      return NextResponse.json({ error: dup ? "Ya existe el parte de alguno de estos trabajadores ese día (duplicado). No se ha guardado ninguna línea." : `No se pudo guardar: ${e2.message}` }, { status: dup ? 409 : 400 });
    }
    await db.from("acciones_pendientes").update({ resultado_id: regs?.[0]?.id ?? null }).eq("id", id);
    return NextResponse.json({ ok: true, estado: "confirmada", tabla: "partes_trabajo", registroId: regs?.[0]?.id });
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
