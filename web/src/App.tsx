import { AuthProvider, useAuth } from "./auth";
import { db } from "./supabase";
import { Link, useRuta } from "./router";
import Login from "./pages/Login";
import Inicio from "./pages/Inicio";
import Horas from "./pages/Horas";
import Nominas from "./pages/Nominas";

const MENU: { to: string; texto: string; solo?: "gestion" }[] = [
  { to: "/", texto: "🏠 Inicio" }, { to: "/horas", texto: "⏱️ Horas" }, { to: "/nominas", texto: "🧾 Nóminas", solo: "gestion" },
];

function Shell() {
  const { cargando, session, perfil, puedeGestionar } = useAuth();
  const ruta = useRuta();
  if (cargando) return <p className="mt-[30vh] text-center text-stone-500">Cargando…</p>;
  if (!session) return <Login />;
  if (!perfil) return <p className="mt-[30vh] text-center text-stone-500">Tu usuario no tiene perfil activo. Habla con el administrador.</p>;

  const Pagina = ruta === "/horas" ? Horas : ruta === "/nominas" ? Nominas : Inicio;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <span className="font-semibold text-brand-700">🌱 Control de Fincas</span>
          <nav className="flex flex-wrap gap-1 text-sm">
            {MENU.filter((m) => !m.solo || puedeGestionar).map((m) => (
              <Link key={m.to} to={m.to} className={`rounded-lg px-3 py-1.5 ${ruta === m.to ? "bg-brand-50 font-medium text-brand-700" : "text-stone-600 hover:bg-stone-100"}`}>{m.texto}</Link>
            ))}
          </nav>
          <span className="ml-auto flex items-center gap-2 text-xs text-stone-500">
            {perfil.nombre} · {perfil.rol}
            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => db.auth.signOut()}>Cerrar sesión</button>
          </span>
        </div>
      </header>
      <main className="px-4 py-4"><Pagina /></main>
    </div>
  );
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>;
}
