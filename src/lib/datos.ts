import { createClient } from "@/lib/supabase/server";

export type Rol = "administrador" | "responsable" | "encargado" | "consulta";

/** Perfil + catálogos que usan los formularios. Todo pasa por RLS: solo fincas autorizadas. */
export async function cargarContexto() {
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  const [perfil, fincas, campanas, equipos, trabajadores] = await Promise.all([
    db.from("profiles").select("nombre,rol").eq("id", auth.user!.id).single(),
    db.from("fincas").select("id,codigo,nombre,parcelas(id,codigo,nombre)").eq("activa", true).order("nombre"),
    db.from("campanas").select("id,nombre").order("fecha_inicio", { ascending: false }),
    db.from("equipos").select("id,nombre,finca_id,coste_hora").eq("activo", true).order("nombre"),
    db.from("trabajadores").select("id,nombre,finca_id,coste_hora").eq("activo", true).order("nombre"),
  ]);
  const rol = (perfil.data?.rol ?? "consulta") as Rol;
  return {
    db, rol,
    fincas: fincas.data ?? [], campanas: campanas.data ?? [],
    equipos: equipos.data ?? [], trabajadores: trabajadores.data ?? [],
    esAdmin: rol === "administrador",
    puedeGestionar: rol === "administrador" || rol === "responsable",
    puedeRegistrar: rol !== "consulta",
  };
}
