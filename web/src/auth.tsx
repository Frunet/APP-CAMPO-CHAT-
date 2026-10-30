import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { db } from "./supabase";

export type Rol = "administrador" | "responsable" | "encargado" | "consulta";
export type Finca = { id: string; nombre: string };
export type Perfil = { id: string; nombre: string; email: string | null; rol: Rol };
type Ctx = { cargando: boolean; session: Session | null; perfil: Perfil | null; fincas: Finca[]; puedeGestionar: boolean; puedeRegistrar: boolean; esAdmin: boolean };

const C = createContext<Ctx>({ cargando: true, session: null, perfil: null, fincas: [], puedeGestionar: false, puedeRegistrar: false, esAdmin: false });
export const useAuth = () => useContext(C);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [fincas, setFincas] = useState<Finca[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!session) { setPerfil(null); setFincas([]); setCargando(false); return; }
      const [{ data: p }, { data: f }] = await Promise.all([
        db.from("profiles").select("id,nombre,email,rol").eq("id", session.user.id).maybeSingle(),
        db.from("fincas").select("id,nombre").eq("activa", true).order("nombre"),
      ]);
      if (!vivo) return;
      setPerfil((p as Perfil) ?? null); setFincas((f as Finca[]) ?? []); setCargando(false);
    })();
    return () => { vivo = false; };
  }, [session]);

  const rol = perfil?.rol;
  return (
    <C.Provider value={{ cargando, session, perfil, fincas, esAdmin: rol === "administrador", puedeGestionar: rol === "administrador" || rol === "responsable", puedeRegistrar: !!rol && rol !== "consulta" }}>
      {children}
    </C.Provider>
  );
}
