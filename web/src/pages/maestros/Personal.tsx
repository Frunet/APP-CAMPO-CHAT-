import { useState } from "react";
import { db } from "../../supabase";
import { AccionForm } from "../../forms";
import { Field, useCarga } from "../../ui";
import { fecha } from "../../lib/format";
import { actualizarEquipo, actualizarTrabajador, crearEquipo, crearFestivo, crearTrabajador, eliminarFestivo, eliminarTrabajador } from "../../lib/maestros";
import { msgError } from "../../ui";

const eur = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €`);

/** Campos de tarifa compartidos por equipos y trabajadores */
function Tarifas({ v, desde }: { v?: any; desde?: boolean }) {
  return (
    <>
      <Field label="€/hora normal"><input name="coste_hora" inputMode="decimal" className="input" defaultValue={v?.coste_hora ?? ""} /></Field>
      <Field label="€/hora extra"><input name="coste_hora_extra" inputMode="decimal" className="input" defaultValue={v?.coste_hora_extra ?? ""} /></Field>
      <Field label="€/hora festivo"><input name="coste_hora_festivo" inputMode="decimal" className="input" defaultValue={v?.coste_hora_festivo ?? ""} /></Field>
      {desde && <Field label="Tarifa válida desde (vacío = hoy)"><input type="date" name="coste_desde" className="input" /></Field>}
      <Field label="Condiciones acordadas (notas)" wide><input name="condiciones" className="input" defaultValue={v?.condiciones ?? ""} placeholder="Ej.: jornal pactado, plus de transporte…" /></Field>
    </>
  );
}

/** Eliminar un trabajador: pide confirmación y avisa de cuántas horas registradas tiene (se conservan a su nombre, sin ficha). */
function EliminarTrabajador({ r, onOk }: { r: any; onOk: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function eliminar() {
    setMsg(null);
    const { count } = await db.from("partes_trabajo").select("id", { count: "exact", head: true }).eq("trabajador_id", r.id);
    const n = count ?? 0;
    const quien = `${r.codigo ? `${r.codigo} · ` : ""}${r.nombre}`;
    const texto = n
      ? `¿Eliminar a ${quien}?

Tiene ${n} registro(s) de horas. Se conservan, con sus horas y costes, a su nombre, pero ya sin ficha de trabajador.

Si solo quieres que deje de salir en las listas, desmarca «Activo» en lugar de eliminarlo.`
      : `¿Eliminar a ${quien}? No tiene horas registradas.`;
    if (!window.confirm(texto)) return;
    setOcupado(true);
    try { await eliminarTrabajador(r.id); onOk(); } catch (e) { setMsg(msgError(e as { message?: string })); }
    setOcupado(false);
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-stone-200 pt-3">
      <button type="button" className="btn-ghost !border-red-300 !text-red-700" disabled={ocupado} onClick={eliminar}>{ocupado ? "Eliminando…" : "🗑 Eliminar trabajador"}</button>
      {msg && <span role="alert" className="text-sm text-red-600">{msg}</span>}
    </div>
  );
}

export default function Personal() {
  const { datos, error, recargar } = useCarga(async () => {
    const [e, t, f, h, fi] = await Promise.all([
      db.from("equipos").select("*, fincas(nombre)").order("nombre"),
      db.from("trabajadores").select("*, fincas(nombre)").order("nombre"),
      db.from("festivos").select("id,fecha,nombre,fincas(nombre)").order("fecha", { ascending: false }),
      db.from("trabajadores_coste").select("trabajador_id,desde,coste_hora,coste_hora_extra,coste_hora_festivo").order("desde", { ascending: false }),
      db.from("fincas").select("id,nombre").eq("activa", true).order("nombre"),
    ]);
    return { equipos: (e.data ?? []) as any[], trabajadores: (t.data ?? []) as any[], festivos: (f.data ?? []) as any[], historico: (h.data ?? []) as any[], fincas: (fi.data ?? []) as { id: string; nombre: string }[] };
  }, []);
  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!datos) return <p className="text-sm text-stone-500">Cargando…</p>;
  const { equipos, trabajadores, festivos, historico, fincas } = datos;
  const histDe = (id: string) => historico.filter((h) => h.trabajador_id === id);
  const selFinca = <Field label="Finca *"><select name="finca_id" className="input" required><option value="">Elige…</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>;

  const ficha = (r: any, tipo: "equipo" | "trabajador") => (
    <details key={r.id} className="rounded-lg border border-stone-200 px-3 py-2">
      <summary className="cursor-pointer text-sm">
        {tipo === "trabajador" && <span className="font-mono text-xs text-stone-500">{r.codigo ?? "sin código"} · </span>}
        <b>{r.nombre}</b> <span className="text-stone-500">· {r.fincas?.nombre ?? "todas las fincas"}</span> · normal {eur(r.coste_hora)} · extra {eur(r.coste_hora_extra)} · festivo {eur(r.coste_hora_festivo)}
        {r.condiciones && <span className="text-stone-500"> · {r.condiciones}</span>}
        {!r.activo && <span className="text-red-600"> · inactivo</span>}
      </summary>
      <div className="mt-3">
        <AccionForm accion={tipo === "equipo" ? actualizarEquipo : actualizarTrabajador} label="Guardar" reset={false} className="grid gap-3 sm:grid-cols-4" onOk={recargar}>
          <input type="hidden" name="id" value={r.id} />
          <Field label="Nombre *"><input name="nombre" className="input" required defaultValue={r.nombre} /></Field>
          {tipo === "trabajador" && (
            <>
              <Field label="Código *"><input name="codigo" className="input" required maxLength={30} defaultValue={r.codigo ?? ""} /></Field>
              <Field label="Teléfono"><input name="telefono" type="tel" className="input" defaultValue={r.telefono ?? ""} /></Field>
              <Field label="Observaciones" wide><input name="observaciones" className="input" defaultValue={r.observaciones ?? ""} /></Field>
            </>
          )}
          <Tarifas v={r} desde={tipo === "trabajador"} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activo" defaultChecked={r.activo} /> Activo</label>
        </AccionForm>
        {tipo === "trabajador" && <EliminarTrabajador r={r} onOk={recargar} />}
        {tipo === "trabajador" && histDe(r.id).length > 0 && (
          <div className="mt-3 text-xs text-stone-600">
            <p className="font-medium">Histórico de tarifas (cada parte usa la vigente en su fecha)</p>
            <ul className="mt-1 space-y-0.5">
              {histDe(r.id).map((h) => <li key={h.desde}>desde {h.desde === "2000-01-01" ? "el principio" : fecha(h.desde)}: normal {eur(h.coste_hora)} · extra {eur(h.coste_hora_extra)} · festivo {eur(h.coste_hora_festivo)}</li>)}
            </ul>
          </div>
        )}
      </div>
    </details>
  );

  return (
    <div className="space-y-4">
      <section className="card text-sm text-stone-700">
        <h2 className="mb-1 font-medium">Cómo se calcula el coste de un parte</h2>
        <ul className="list-disc space-y-0.5 pl-5">
          <li><b>Día festivo</b> (lista de festivos de abajo): todas las horas × tarifa festiva.</li>
          <li><b>Resto de días</b>: horas normales × tarifa normal + horas extra × tarifa extra.</li>
          <li>Un <b>trabajador con condiciones acordadas</b> usa sus propias tarifas, y su parte se registra de forma individual. Una <b>cuadrilla</b> usa las tarifas de su equipo.</li>
          <li>Si falta una tarifa necesaria, el parte queda «sin tarifa»: el coste no se estima.</li>
          <li>Cambiar una tarifa no recalcula los partes ya registrados. Cada cambio queda en el histórico del trabajador con su fecha de inicio, y un parte nuevo usa la tarifa vigente en la fecha del parte.</li>
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Equipos y cuadrillas <span className="text-xs font-normal text-stone-500">(tarifa por persona y hora)</span></h2>
        {equipos.map((r) => ficha(r, "equipo"))}
        {!equipos.length && <p className="text-sm text-stone-500">Aún no hay equipos.</p>}
        <details>
          <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Nuevo equipo / cuadrilla</summary>
          <div className="mt-2">
            <AccionForm accion={crearEquipo} label="Crear equipo" className="grid gap-3 sm:grid-cols-4" onOk={recargar}>
              <Field label="Nombre *"><input name="nombre" className="input" required /></Field>
              {selFinca}
              <Tarifas />
            </AccionForm>
          </div>
        </details>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Trabajadores con condiciones propias</h2>
        {trabajadores.map((r) => ficha(r, "trabajador"))}
        {!trabajadores.length && <p className="text-sm text-stone-500">Aún no hay trabajadores individuales.</p>}
        <details>
          <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Nuevo trabajador</summary>
          <div className="mt-2">
            <AccionForm accion={crearTrabajador} label="Crear trabajador" className="grid gap-3 sm:grid-cols-4" onOk={recargar}>
              <Field label="Código * (único)"><input name="codigo" className="input" required maxLength={30} /></Field>
              <Field label="Nombre y apellidos *"><input name="nombre" className="input" required /></Field>
              {selFinca}
              <Field label="Teléfono"><input name="telefono" type="tel" className="input" /></Field>
              <Field label="Observaciones" wide><input name="observaciones" className="input" /></Field>
              <Tarifas desde />
            </AccionForm>
          </div>
        </details>
      </section>

      <section className="card space-y-2">
        <h2 className="font-medium">Festivos</h2>
        <p className="text-xs text-stone-500">Los partes de estas fechas se calculan con la tarifa festiva. Si eliges una finca, solo vale para ella.</p>
        <ul className="space-y-1 text-sm">
          {festivos.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span className="w-24 text-stone-600">{fecha(r.fecha)}</span><span>{r.nombre}</span>
              <span className="text-xs text-stone-400">{r.fincas?.nombre ?? "todas las fincas"}</span>
              <AccionForm accion={eliminarFestivo} label="Quitar" danger reset={false} className="ml-auto" confirmar="¿Quitar este festivo?" onOk={recargar}><input type="hidden" name="id" value={r.id} /></AccionForm>
            </li>
          ))}
          {!festivos.length && <li className="text-stone-500">No hay festivos definidos.</li>}
        </ul>
        <AccionForm accion={crearFestivo} label="Añadir festivo" className="grid gap-3 sm:grid-cols-4" onOk={recargar}>
          <Field label="Fecha *"><input type="date" name="fecha" className="input" required /></Field>
          <Field label="Nombre *"><input name="nombre" className="input" required placeholder="Fiesta local" /></Field>
          <Field label="Finca (opcional)"><select name="finca_id" className="input"><option value="">Todas</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
        </AccionForm>
      </section>
    </div>
  );
}
