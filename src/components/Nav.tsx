"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const todos: { href: string; label: string; icon: string; soloAdmin?: boolean; soloGestion?: boolean }[] = [
  { href: "/", label: "Inicio", icon: "🏠" },
  { href: "/horas", label: "Horas", icon: "⏱️" },
  { href: "/chat", label: "Chat inteligente", icon: "💬" },
  { href: "/nominas", label: "Nóminas", icon: "🧾", soloGestion: true },
  { href: "/resultados", label: "Cuenta de Resultados", icon: "📈" },
  { href: "/calendario", label: "Calendario", icon: "📅" },
  { href: "/maestros", label: "Maestros", icon: "🗂️", soloAdmin: true },
];
const movil = ["/", "/horas", "/chat", "/calendario"];


export default function Nav({ nombre, rol }: { nombre: string; rol: string }) {
  const items = todos.filter((i) => (!i.soloAdmin || rol === "administrador") && (!i.soloGestion || rol === "administrador" || rol === "responsable")); // Maestros: solo administrador
  const path = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const activo = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));

  async function salir() {
    await createClient().auth.signOut();
    router.replace("/login");
  }

  const link = (i: (typeof items)[number]) => (
    <Link key={i.href} href={i.href} onClick={() => setAbierto(false)}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${activo(i.href) ? "bg-brand-100 font-medium text-brand-900" : "text-stone-700 hover:bg-stone-100"}`}>
      <span>{i.icon}</span><span className="flex-1">{i.label}</span>
    </Link>
  );

  return (
    <>
      {/* Escritorio / tablet */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-stone-200 bg-white p-3 md:flex md:sticky md:top-0 md:h-screen">
        <div className="px-3 py-3 text-lg font-semibold text-brand-700">🌱 Control de Fincas</div>
        <nav className="flex-1 space-y-1 overflow-y-auto">{items.map(link)}</nav>
        <div className="border-t border-stone-200 pt-3 text-sm">
          <div className="px-3 font-medium">{nombre}</div>
          <div className="px-3 text-xs capitalize text-stone-500">{rol}</div>
          <button onClick={salir} className="mt-2 w-full rounded-lg px-3 py-2 text-left text-stone-600 hover:bg-stone-100">Cerrar sesión</button>
        </div>
      </aside>

      {/* Móvil: barra inferior con acceso directo al chat */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white md:hidden">
        {items.filter((i) => movil.includes(i.href)).map((i) => (
          <Link key={i.href} href={i.href} className={`flex flex-1 flex-col items-center py-2 text-xs ${activo(i.href) ? "text-brand-700" : "text-stone-500"}`}>
            <span className="text-lg">{i.icon}</span>{i.label.split(" ")[0]}
          </Link>
        ))}
        <button onClick={() => setAbierto(true)} className="flex flex-1 flex-col items-center py-2 text-xs text-stone-500">
          <span className="text-lg">☰</span>Más
        </button>
      </nav>
      {abierto && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setAbierto(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] space-y-1 overflow-y-auto rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            {items.map(link)}
            <button onClick={salir} className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-600">Cerrar sesión</button>
          </div>
        </div>
      )}
    </>
  );
}
