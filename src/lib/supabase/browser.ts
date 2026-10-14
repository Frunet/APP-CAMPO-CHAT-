import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO } from "@/lib/demo/config";
import { crearClienteDemo } from "@/lib/demo/cliente";

export function createClient(): SupabaseClient {
  if (DEMO) return crearClienteDemo();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
