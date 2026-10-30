import { AuthProvider, useAuth } from "./auth";
import { db } from "./supabase";
import { Link, useRuta } from "./router";
import { fondo } from "./ui";
import Login from "./pages/Login";
import Horas from "./pages/Horas";
import Nominas from "./pages/Nominas";
import Maestros from "./pages/Maestros";
import Ultimos7 from "./pages/Ultimos7";
import Historial from "./pages/Historial";

const MENU: { to: string; texto: string; solo?: "gestion" | "admin" | "hist" }[] = [
  { to: "/horas", texto: "⏱️ Horas" }, { to: "/ultimos7", texto: "📅 Últimos 7 días" }, { to: "/historial", texto: "📚 Historial", solo: "hist" }, { to: "/nominas", texto: "🧾 Nóminas", solo: "gestion" }, { to: "/maestros", texto: "🗂️ Maestros", solo: "admin" },
];

/** Guarda la altura de la cabecera (--cab-h) para que Horas ocupe justo el resto de la pantalla. Función estable: se ejecuta una sola vez. */
function medirCabecera(el: HTMLElement | null) {
  if (!el) return;
  const poner = () => document.documentElement.style.setProperty("--cab-h", `${el.offsetHeight}px`);
  poner();
  new ResizeObserver(poner).observe(el);
}

function Shell() {
  const { cargando, session, perfil, puedeGestionar, esAdmin } = useAuth();
  const ruta = useRuta();
  if (cargando) return <p className="mt-[30vh] text-center text-stone-500">Cargando…</p>;
  if (!session) return <Login />;
  if (!perfil) return <p className="mt-[30vh] text-center text-stone-500">Tu usuario no tiene perfil activo. Habla con el administrador.</p>;

  const Pagina = ruta === "/nominas" ? Nominas : ruta === "/maestros" ? Maestros : ruta === "/ultimos7" ? Ultimos7 : ruta === "/historial" ? Historial : Horas;
  return (
    <div className="fr-fondo min-h-screen" style={fondo}>
      <header ref={medirCabecera} className="fr-cabecera sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <span className="fr-marca flex items-center gap-2"><img src={`${import.meta.env.BASE_URL}logo.png`} alt="FRUNET" className="fr-logo" /><small>Control de fincas</small></span>
          <nav className="fr-nav flex flex-wrap gap-2 text-sm">
            {MENU.filter((m) => !m.solo || (m.solo === "admin" ? esAdmin : m.solo === "hist" ? (perfil.rol === "administrador" || perfil.rol === "encargado") : puedeGestionar)).map((m) => (
              <Link key={m.to} to={m.to} className={`fr-pestana ${(ruta === m.to || (m.to === "/horas" && ruta === "/")) ? "fr-pestana-activa" : ""}`}>{m.texto}</Link>
            ))}
          </nav>
          <span className="fr-usuario ml-auto flex items-center gap-2 text-xs text-stone-600">
            <span className="fr-usuario-texto">{perfil.nombre} · {perfil.rol}</span>
            <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => db.auth.signOut()}>Cerrar sesión</button>
          </span>
        </div>
      </header>
      <main className="px-4 py-5"><Pagina /></main>
    </div>
  );
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>;
}
