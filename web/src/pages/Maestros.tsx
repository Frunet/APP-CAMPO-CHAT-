import { useState } from "react";
import { Navigate } from "../router";
import { useAuth } from "../auth";
import Usuarios from "./maestros/Usuarios";
import Fincas from "./maestros/Fincas";
import Cultivos from "./maestros/Cultivos";
import Personal from "./maestros/Personal";

const SECCIONES: [string, string, () => React.JSX.Element][] = [
  ["usuarios", "Usuarios y fincas asignadas", Usuarios],
  ["fincas", "Fincas, parcelas y lotes", Fincas],
  ["cultivos", "Cultivos", Cultivos],
  ["personal", "Personal y costes", Personal],
];

export default function Maestros() {
  const { esAdmin, cargando } = useAuth();
  const [activa, setActiva] = useState(() => { try { return localStorage.getItem("maestros_seccion") ?? "usuarios"; } catch { return "usuarios"; } });
  if (cargando) return null;
  if (!esAdmin) return <Navigate to="/" />; // los maestros solo los gestiona el administrador
  const [, , Seccion] = SECCIONES.find(([k]) => k === activa) ?? SECCIONES[0];
  const elegir = (k: string) => { setActiva(k); try { localStorage.setItem("maestros_seccion", k); } catch { /* sin almacenamiento */ } };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Maestros</h1>
        <p className="text-sm text-stone-500">Datos de base de la aplicación. Solo el administrador puede crearlos o modificarlos; el resto de módulos los usan en consulta.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {SECCIONES.map(([k, t]) => (
          <button key={k} type="button" onClick={() => elegir(k)} className={`rounded-full border px-3 py-1 text-sm ${activa === k ? "border-brand-600 bg-brand-100 text-brand-900" : "border-stone-300 bg-white"}`}>{t}</button>
        ))}
      </div>
      <Seccion />
    </div>
  );
}
