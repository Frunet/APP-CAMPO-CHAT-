import { useState } from "react";
import { useAuth } from "../auth";
import { db } from "../supabase";
import { Navigate } from "../router";
import { Field, useCarga, msgError } from "../ui";
import { activoEnFinca, type AsignacionFinca } from "../lib/personal-fincas";
import { normalizarPersonal, grupoPersonal } from "../lib/grupos-personal";
type Trab = { id: string; codigo: string | null; nombre: string; activo: boolean; trabajadores_fincas: AsignacionFinca[] };
export default function MiPersonal() {
  const { fincas, puedeRegistrar, cargando: authCargando } = useAuth();
  const [finca, setFinca] = useState(""), [buscar, setBuscar] = useState(""), [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false), [mensaje, setMensaje] = useState("");
  const fincaId = finca || fincas[0]?.id || "";
  const { datos, cargando, error, recargar } = useCarga(async () => {
    if (!puedeRegistrar) return [] as Trab[];
    const r = await db.rpc("listar_personal_disponible");
    if (r.error) throw new Error(r.error.message);
    return (r.data ?? []) as Trab[];
  }, [puedeRegistrar]);
  async function cambiar(t: Trab) {
    if (ocupado || !t.activo) return;
    const activar = !activoEnFinca(t, fincaId);
    setOcupado(true); setMensaje("");
    const r = await db.rpc("cambiar_actividad_trabajador_finca", { p_trabajador: t.id, p_finca: fincaId, p_activo: activar });
    if (r.error) setMensaje(msgError(r.error));
    else { setMensaje(`${t.nombre}: ${activar ? "activo" : "inactivo"} en ${fincas.find(f=>f.id===fincaId)?.nombre}.`); recargar(); }
    setOcupado(false);
  }
  if (authCargando) return null;
  if (!puedeRegistrar) return <Navigate to="/ayer" />;
  const disponibles = (datos ?? []).filter(t=>t.activo);
  const q = normalizarPersonal(buscar);
  const visibles = disponibles.filter(t=>(!q || normalizarPersonal(`${t.codigo ?? ""} ${t.nombre}`).includes(q)) && (!estado || (estado==="activo")===activoEnFinca(t,fincaId)));
  return <div className="mx-auto max-w-4xl space-y-4"><h1 className="text-xl font-semibold">Mi personal</h1>
    <p className="text-sm">Puedes elegir entre los trabajadores activos de todas las fincas. Activa cualquiera en tu finca, aunque todavía no estuviera asignado. Los cambios conservan las horas anteriores y las asignaciones a otras fincas.</p>
    <div className="card grid gap-3 sm:grid-cols-3"><Field label="Finca"><select className="input" value={fincaId} disabled={ocupado} onChange={e=>{setFinca(e.target.value);setMensaje("");}}>{fincas.map(f=><option key={f.id} value={f.id}>{grupoPersonal(f)} · {f.nombre}</option>)}</select></Field><Field label="Trabajador"><input className="input" placeholder="Código o nombre" value={buscar} onChange={e=>setBuscar(e.target.value)} /></Field><Field label="Estado en esta finca"><select className="input" value={estado} onChange={e=>setEstado(e.target.value)}><option value="">Todos los disponibles</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select></Field></div>
    {error && <p role="alert" className="card text-red-700">{error}</p>}{mensaje && <p role="status" className="card">{mensaje}</p>}{cargando && <p>Cargando personal…</p>}
    {!cargando && datos && <div className="card overflow-x-auto"><p className="mb-3 text-sm">{disponibles.filter(t=>activoEnFinca(t,fincaId)).length} activos en esta finca · {disponibles.length} trabajadores disponibles en total</p><table className="w-full"><thead><tr>{["Código","Trabajador","Estado en la finca","Acción"].map(h=><th key={h} className="th">{h}</th>)}</tr></thead><tbody>{visibles.map(t=><tr key={t.id}><td className="td">{t.codigo ?? "—"}</td><td className="td">{t.nombre}</td><td className="td">{!t.activo ? "Baja general" : activoEnFinca(t,fincaId) ? "Activo" : "Inactivo"}</td><td className="td"><button className="btn-ghost" disabled={ocupado || !t.activo} onClick={()=>cambiar(t)} aria-label={`${activoEnFinca(t,fincaId) ? "Desactivar" : "Activar"} ${t.nombre}`}>{activoEnFinca(t,fincaId) ? "Desactivar" : "Activar"}</button>{!t.activo && <small className="block">Reactivación general: administrador</small>}</td></tr>)}</tbody></table>{!visibles.length && <p className="py-3 text-sm">No hay trabajadores con estos filtros.</p>}</div>}
  </div>;
}
