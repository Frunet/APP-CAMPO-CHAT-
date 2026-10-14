import { createServerClient } from "@supabase/ssr";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO } from "@/lib/demo/config";
import { crearClienteDemo } from "@/lib/demo/cliente";

/** Cliente con la sesión del usuario: todas las consultas pasan por RLS. */
export async function createClient(): Promise<SupabaseClient> {
  if (DEMO) return crearClienteDemo();
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            /* llamado desde un Server Component: el proxy refresca la sesión */
          }
        },
      },
    },
  );
}

/** Solo para tareas en segundo plano (cron de avisos). Salta RLS: nunca usar con datos del usuario. */
export function createServiceClient() {
  if (DEMO) return crearClienteDemo();
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
