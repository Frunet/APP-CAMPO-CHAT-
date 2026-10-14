import { actualizarEquipo, actualizarTrabajador, crearEquipo, crearFestivo, crearTrabajador, eliminarFestivo } from "@/lib/actions";
import ActionForm, { Field } from "../ActionForm";
import type { cargarContexto } from "@/lib/datos";
import { fecha } from "@/lib/format";

type Ctx = Awaited<ReturnType<typeof cargarContexto>>;

const eur = (n: number | null | undefined) => (n == null ? "—" : `${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €`);

/** Campos de tarifa compartidos por equipos y trabajadores */
function Tarifas({ v }: { v?: any }) {
  return (
    <>
      <Field label="€/hora normal"><input name="coste_hora" inputMode="decimal" className="input" defaultValue={v?.coste_hora ?? ""} /></Field>
      <Field label="€/hora extra"><input name="coste_hora_extra" inputMode="decimal" className="input" defaultValue={v?.coste_hora_extra ?? ""} /></Field>
      <Field label="€/hora festivo"><input name="coste_hora_festivo" inputMode="decimal" className="input" defaultValue={v?.coste_hora_festivo ?? ""} /></Field>
      <Field label="Condiciones acordadas (notas)" wide><input name="condiciones" className="input" defaultValue={v?.condiciones ?? ""} placeholder="Ej.: jornal pactado, plus de transporte…" /></Field>
    </>
  );
}

export default async function SeccionPersonal({ ctx }: { ctx: Ctx }) {
  const [{ data: equipos }, { data: trabajadores }, { data: festivos }] = await Promise.all([
    ctx.db.from("equipos").select("*, fincas(nombre)").order("nombre"),
    ctx.db.from("trabajadores").select("*, fincas(nombre)").order("nombre"),
    ctx.db.from("festivos").select("id,fecha,nombre,fincas(nombre)").order("fecha", { ascending: false }),
  ]);
  const selFinca = (
    <Field label="Finca *"><select name="finca_id" className="input" required><option value="">Elige…</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
  );

  const ficha = (r: any, tipo: "equipo" | "trabajador") => (
    <details key={r.id} className="rounded-lg border border-stone-200 px-3 py-2">
      <summary className="cursor-pointer text-sm">
        <b>{r.nombre}</b> <span className="text-stone-500">· {r.fincas?.nombre}</span> · normal {eur(r.coste_hora)} · extra {eur(r.coste_hora_extra)} · festivo {eur(r.coste_hora_festivo)}
        {r.condiciones && <span className="text-stone-500"> · {r.condiciones}</span>}
        {!r.activo && <span className="text-red-600"> · inactivo</span>}
      </summary>
      <div className="mt-3">
        <ActionForm action={tipo === "equipo" ? actualizarEquipo : actualizarTrabajador} label="Guardar" reset={false} className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="id" value={r.id} />
          <Field label="Nombre *"><input name="nombre" className="input" required defaultValue={r.nombre} /></Field>
          <Tarifas v={r} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activo" defaultChecked={r.activo} /> Activo</label>
        </ActionForm>
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
          <li>Cambiar una tarifa no recalcula los partes ya registrados: conservan la que se aplicó.</li>
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Equipos y cuadrillas <span className="text-xs font-normal text-stone-500">(tarifa por persona y hora)</span></h2>
        {((equipos ?? []) as any[]).map((r) => ficha(r, "equipo"))}
        {!(equipos ?? []).length && <p className="text-sm text-stone-500">Aún no hay equipos.</p>}
        <details>
          <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Nuevo equipo / cuadrilla</summary>
          <div className="mt-2">
            <ActionForm action={crearEquipo} label="Crear equipo" className="grid gap-3 sm:grid-cols-4">
              <Field label="Nombre *"><input name="nombre" className="input" required /></Field>
              {selFinca}
              <Tarifas />
            </ActionForm>
          </div>
        </details>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Trabajadores con condiciones propias</h2>
        {((trabajadores ?? []) as any[]).map((r) => ficha(r, "trabajador"))}
        {!(trabajadores ?? []).length && <p className="text-sm text-stone-500">Aún no hay trabajadores individuales.</p>}
        <details>
          <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Nuevo trabajador</summary>
          <div className="mt-2">
            <ActionForm action={crearTrabajador} label="Crear trabajador" className="grid gap-3 sm:grid-cols-4">
              <Field label="Nombre *"><input name="nombre" className="input" required /></Field>
              {selFinca}
              <Tarifas />
            </ActionForm>
          </div>
        </details>
      </section>

      <section className="card space-y-2">
        <h2 className="font-medium">Festivos</h2>
        <p className="text-xs text-stone-500">Los partes de estas fechas se calculan con la tarifa festiva. Si eliges una finca, solo vale para ella.</p>
        <ul className="space-y-1 text-sm">
          {((festivos ?? []) as any[]).map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span className="w-24 text-stone-600">{fecha(r.fecha)}</span><span>{r.nombre}</span>
              <span className="text-xs text-stone-400">{r.fincas?.nombre ?? "todas las fincas"}</span>
              <ActionForm action={eliminarFestivo} label="Quitar" danger reset={false} className="ml-auto" confirmar="¿Quitar este festivo?"><input type="hidden" name="id" value={r.id} /></ActionForm>
            </li>
          ))}
          {!(festivos ?? []).length && <li className="text-stone-500">No hay festivos definidos.</li>}
        </ul>
        <ActionForm action={crearFestivo} label="Añadir festivo" className="grid gap-3 sm:grid-cols-4">
          <Field label="Fecha *"><input type="date" name="fecha" className="input" required /></Field>
          <Field label="Nombre *"><input name="nombre" className="input" required placeholder="Fiesta local" /></Field>
          <Field label="Finca (opcional)"><select name="finca_id" className="input"><option value="">Todas</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
        </ActionForm>
      </section>
    </div>
  );
}
