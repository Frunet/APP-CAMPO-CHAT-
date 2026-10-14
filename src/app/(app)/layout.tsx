import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import { DEMO } from "@/lib/demo/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: perfil } = await db.from("profiles").select("nombre,rol").eq("id", auth.user.id).single();
  const { count } = await db.from("avisos").select("id", { count: "exact", head: true }).eq("estado", "pendiente");

  return (
    <div className="min-h-screen md:flex">
      <Nav nombre={perfil?.nombre ?? ""} rol={perfil?.rol ?? "consulta"} avisos={count ?? 0} />
      <main className="min-w-0 flex-1 p-4 pb-24 md:p-6 md:pb-6">
        {DEMO && (
          <div role="status" className="mx-auto mb-4 max-w-5xl rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <b>Modo demo</b> · datos ficticios de ejemplo; los cambios no se guardan y el asistente responde con textos de muestra.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
