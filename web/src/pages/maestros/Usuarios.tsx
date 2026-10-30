import { db } from "../../supabase";
import { useAuth } from "../../auth";
import { AccionForm } from "../../forms";
import { Field, useCarga } from "../../ui";
import { actualizarUsuario, cambiarPassword, crearUsuario } from "../../lib/maestros";

const ROLES = [
  ["administrador", "Administrador · acceso completo"],
  ["responsable", "Responsable de finca · gestiona sus fincas"],
  ["encargado", "Encargado · registra trabajos y cosechas"],
  ["consulta", "Consulta · solo lectura"],
];
type Usuario = { id: string; nombre: string; email: string | null; rol: string; activo: boolean };

export default function Usuarios() {
  const { perfil } = useAuth();
  const { datos, error, recargar } = useCarga(async () => {
    const [u, a, f, l] = await Promise.all([
      db.from("profiles").select("id,nombre,email,rol,activo").order("nombre"),
      db.from("usuarios_fincas").select("user_id,finca_id"),
      db.from("fincas").select("id,nombre").order("nombre"),
      db.from("audit_log").select("id,tabla,accion,usuario_id,fecha").order("fecha", { ascending: false }).limit(30),
    ]);
    return { usuarios: (u.data ?? []) as Usuario[], accesos: (a.data ?? []) as { user_id: string; finca_id: string }[], fincas: (f.data ?? []) as { id: string; nombre: string }[], audit: (l.data ?? []) as { id: number; tabla: string; accion: string; usuario_id: string | null; fecha: string }[] };
  }, []);
  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!datos) return <p className="text-sm text-stone-500">Cargando…</p>;
  const { usuarios, accesos, fincas, audit } = datos;
  const nombre = new Map(usuarios.map((u) => [u.id, u.nombre]));
  const fincasDe = (uid: string) => new Set(accesos.filter((a) => a.user_id === uid).map((a) => a.finca_id));

  const checks = (sel: Set<string>) => (
    <div className="col-span-full">
      <span className="mb-1 block text-xs font-medium text-stone-600">Fincas asignadas (el administrador accede a todas)</span>
      <div className="flex flex-wrap gap-3">
        {fincas.map((f) => <label key={f.id} className="flex items-center gap-1 text-sm"><input type="checkbox" name="fincas" value={f.id} defaultChecked={sel.has(f.id)} /> {f.nombre}</label>)}
        {!fincas.length && <span className="text-sm text-stone-500">Aún no hay fincas: créalas en «Fincas, parcelas y lotes».</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <details className="card">
        <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Nuevo usuario</summary>
        <div className="mt-3">
          <AccionForm accion={crearUsuario} label="Crear usuario" onOk={recargar}>
            <Field label="Nombre *"><input name="nombre" className="input" required /></Field>
            <Field label="Correo *"><input name="email" type="email" className="input" required autoComplete="off" /></Field>
            <Field label="Contraseña inicial * (mín. 10)"><input name="password" type="password" minLength={10} className="input" required autoComplete="new-password" /></Field>
            <Field label="Rol *"><select name="rol" className="input" defaultValue="consulta">{ROLES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
            {checks(new Set())}
          </AccionForm>
        </div>
      </details>

      {usuarios.map((u) => (
        <details key={u.id} className="card">
          <summary className="cursor-pointer text-sm">
            <b>{u.nombre}</b> <span className="text-stone-500">{u.email}</span> · {u.rol}
            {u.rol !== "administrador" && <span className="text-stone-400"> · {fincasDe(u.id).size} finca(s)</span>}
            {!u.activo && <span className="text-red-600"> · desactivado</span>}
          </summary>
          <div className="mt-3 space-y-3">
            <AccionForm accion={(fd) => actualizarUsuario(fd, perfil!.id)} label="Guardar usuario" reset={false} onOk={recargar}>
              <input type="hidden" name="id" value={u.id} />
              <Field label="Rol"><select name="rol" className="input" defaultValue={u.rol}>{ROLES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="activo" defaultChecked={u.activo} /> Cuenta activa</label>
              {checks(fincasDe(u.id))}
            </AccionForm>
            <AccionForm accion={cambiarPassword} label="Cambiar contraseña" className="grid gap-3 sm:grid-cols-2" confirmar={`¿Cambiar la contraseña de ${u.nombre}?`}>
              <input type="hidden" name="id" value={u.id} />
              <Field label="Nueva contraseña (mín. 10)"><input name="password" type="password" minLength={10} className="input" required autoComplete="new-password" /></Field>
            </AccionForm>
          </div>
        </details>
      ))}

      <section className="card">
        <h2 className="mb-2 font-medium">Actividad reciente (quién y cuándo)</h2>
        <ul className="space-y-1 text-sm">
          {audit.map((a) => (
            <li key={a.id}><span className="text-xs text-stone-500">{new Date(a.fecha).toLocaleString("es-ES")}</span> · {nombre.get(a.usuario_id ?? "") ?? "sistema"} · {a.accion} en {a.tabla}</li>
          ))}
          {!audit.length && <li className="text-stone-500">Sin actividad.</li>}
        </ul>
      </section>
    </div>
  );
}
