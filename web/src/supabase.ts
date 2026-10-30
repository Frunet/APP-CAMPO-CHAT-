import { createClient } from "@supabase/supabase-js";

// Datos públicos del proyecto (la seguridad la dan las reglas RLS de la base de datos, no estas claves)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://rnsoeznosqoetxtcwdzk.supabase.co";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? "sb_publishable_n9YUyODksXPsTvepJkFpzg_MKA6Ct5U";

export const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
