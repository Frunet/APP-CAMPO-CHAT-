import { actualizarUsuario, crearUsuario } from "@/lib/actions";
import ActionForm, { Field } from "../ActionForm";
import type { cargarContexto } from "@/lib/datos";

type Ctx = Awaited<ReturnType<typeof cargarContexto>>;

const ROLES = [
  ["administrador", "Administrador · acceso completo"],
  ["responsable", "Responsable de finca · gestiona sus fincas"],
  ["encargado", "Encargado · registra trabajos y cosechas"],
  ["consulta", "Consulta · solo lectura"],
];

export default async function SeccionUsuarios({ ctx }: { ctx: Ctx }) {
  const [{ data: usuarios }, { data: accesos }, { data: audit }] = await Promise.all([
    ctx.db.from("profiles").select("id,nombre,email,rol,activo").order("nombre"),
    ctx.db.from("usuarios_fincas").select("user_id,finca_id"),
    ctx.db.from("audit_log").select("id,tabla,accion,usuario_id,fecha").order("fecha", { ascending: false }).limit(30),
  ]);
  const nombre = new Map((usuarios ?? []).map((u) => [u.id, u.nombre]));
  const fincasDe = (uid: string) => new Set((accesos ?? []).filter((a) => a.user_id === uid).map((a) => a.finca_id));

  const checks = (sel: Set<string>) => (
    <div className="col-span-full">
      <span className="mb-1 block text-xs font-medium text-stone-600">Fincas asignadas (el administrador accede a todas)</span>
      <div className="flex flex-wrap gap-3">
        {ctx.fincas.map((f) => (
          <label key={f.id} className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="fincas" value={f.id} defaultChecked={sel.has(f.id)} /> {f.nombre}
          </label>
        ))}
        {!ctx.fincas.length && <span className="text-sm text-stone-500">Aún no hay fincas: créalas en «Fincas y estructura».</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <details className="card">
        <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Nuevo usuario</summary>
        <div className="mt-3">
          <ActionForm action={crearUsuario} label="Crear usuario" className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre *"><input name="nombre" className="input" required /></Field>
            <Field label="Correo *"><input name="email" type="email" className="input" required autoComplete="off" /></Field>
            <Field label="Contraseña inicial * (mín. 10)"><input name="password" type="password" minLength={10} className="input" required autoComplete="new-password" /></Field>
            <Field label="Rol *"><select name="rol" className="input" defaultValue="consulta">{ROLES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
            {checks(new Set())}
          </ActionForm>
        </div>
      </details>

      {usuarios?.map((u) => (
        <details key={u.id} className="card">
          <summary className="cursor-pointer text-sm">
            <b>{u.nombre}</b> <span className="text-stone-500">{u.email}</span> · {u.rol}
            {u.rol !== "administrador" && <span className="text-stone-400"> · {fincasDe(u.id).size} finca(s)</span>}
            {!u.activo && <span className="text-red-600"> · desactivado</span>}
          </summary>
          <div className="mt-3">
            <ActionForm action={actualizarUsuario} label="Guardar usuario" reset={false} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={u.id} />
              <Field label="Rol"><select name="rol" className="input" defaultValue={u.rol}>{ROLES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="activo" defaultChecked={u.activo} /> Cuenta activa</label>
              {checks(fincasDe(u.id))}
            </ActionForm>
          </div>
        </details>
      ))}

      <section className="card">
        <h2 className="mb-2 font-medium">Actividad reciente (quién y cuándo)</h2>
        <ul className="space-y-1 text-sm">
          {audit?.map((a) => (
            <li key={a.id}>
              <span className="text-xs text-stone-500">{new Date(a.fecha).toLocaleString("es-ES")}</span> · {nombre.get(a.usuario_id ?? "") ?? "sistema"} · {a.accion} en {a.tabla}
            </li>
          ))}
          {!audit?.length && <li className="text-stone-500">Sin actividad.</li>}
        </ul>
      </section>
    </div>
  );
}
