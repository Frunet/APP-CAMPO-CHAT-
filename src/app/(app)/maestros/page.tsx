import Link from "next/link";
import { redirect } from "next/navigation";
import { cargarContexto } from "@/lib/datos";
import SeccionUsuarios from "@/components/maestros/SeccionUsuarios";
import SeccionFincas from "@/components/maestros/SeccionFincas";
import SeccionCultivos from "@/components/maestros/SeccionCultivos";
import SeccionPersonal from "@/components/maestros/SeccionPersonal";
import SeccionCostes from "@/components/maestros/SeccionCostes";
import SeccionProveedores from "@/components/maestros/SeccionProveedores";
import SeccionFacturas from "@/components/maestros/SeccionFacturas";

const SECCIONES = [
  ["usuarios", "Usuarios y fincas asignadas"],
  ["fincas", "Fincas, parcelas y lotes"],
  ["cultivos", "Cultivos"],
  ["personal", "Personal y costes"],
  ["costes", "Costes generales"],
  ["proveedores", "Proveedores"],
  ["facturas", "Lectura de facturas"],
] as const;

export default async function Maestros({ searchParams }: { searchParams: Promise<{ seccion?: string; campana?: string }> }) {
  const { seccion, campana } = await searchParams;
  const ctx = await cargarContexto();
  if (!ctx.esAdmin) redirect("/"); // los maestros solo los gestiona el administrador
  const activa = SECCIONES.some(([k]) => k === seccion) ? seccion! : "usuarios";

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Maestros</h1>
        <p className="text-sm text-stone-500">Datos de base de la aplicación. Solo el administrador puede crearlos o modificarlos; el resto de módulos los usan en consulta.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SECCIONES.map(([k, t]) => (
          <Link key={k} href={`/maestros?seccion=${k}`} className={`rounded-full border px-3 py-1 text-sm ${activa === k ? "border-brand-600 bg-brand-100 text-brand-900" : "border-stone-300 bg-white"}`}>{t}</Link>
        ))}
      </div>

      {activa === "usuarios" && <SeccionUsuarios ctx={ctx} />}
      {activa === "fincas" && <SeccionFincas ctx={ctx} />}
      {activa === "cultivos" && <SeccionCultivos ctx={ctx} />}
      {activa === "personal" && <SeccionPersonal ctx={ctx} />}
      {activa === "facturas" && <SeccionFacturas ctx={ctx} />}
      {activa === "proveedores" && <SeccionProveedores ctx={ctx} />}
      {activa === "costes" && <SeccionCostes ctx={ctx} campana={campana} />}
    </div>
  );
}
