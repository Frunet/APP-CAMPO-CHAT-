import ActionForm, { Field } from "./ActionForm";
import FincaParcela from "./FincaParcela";
import { guardarCosecha, guardarGasto, guardarParte } from "@/lib/actions";
import type { cargarContexto } from "@/lib/datos";
import { iso } from "@/lib/format";

type Ctx = Awaited<ReturnType<typeof cargarContexto>>;

export function ParteForm({ ctx, parte }: { ctx: Ctx; parte?: any }) {
  const quien = parte?.trabajador_id ? `t:${parte.trabajador_id}` : parte?.equipo_id ? `e:${parte.equipo_id}` : "";
  return (
    <ActionForm action={guardarParte} label={parte ? "Guardar corrección" : "Registrar parte"} reset={!parte} className="grid gap-3 sm:grid-cols-3">
      {parte && <input type="hidden" name="id" value={parte.id} />}
      <Field label="Fecha *"><input type="date" name="fecha" className="input" required defaultValue={parte?.fecha ?? iso(new Date())} /></Field>
      <FincaParcela fincas={ctx.fincas} finca={parte?.finca_id} parcela={parte?.parcela_id} />
      <Field label="Trabajador o equipo">
        <select name="quien" className="input" defaultValue={quien}>
          <option value="">— sin asignar (solo nº de personas) —</option>
          {ctx.equipos.map((e) => <option key={e.id} value={`e:${e.id}`}>Equipo · {e.nombre}</option>)}
          {ctx.trabajadores.map((t) => <option key={t.id} value={`t:${t.id}`}>{t.nombre}</option>)}
        </select>
      </Field>
      <Field label="Nº de trabajadores *"><input name="num_trabajadores" inputMode="numeric" className="input" required defaultValue={parte?.num_trabajadores ?? 1} /></Field>
      <Field label="Horas por trabajador *"><input name="horas_por_trabajador" inputMode="decimal" className="input" defaultValue={parte?.horas_por_trabajador ?? ""} placeholder="7" /></Field>
      <Field label="Coste/hora (€, opcional)"><input name="coste_hora" inputMode="decimal" className="input" defaultValue={parte?.coste_hora ?? ""} /></Field>
      <Field label="Entrada"><input type="time" name="hora_entrada" className="input" defaultValue={parte?.hora_entrada?.slice(0, 5) ?? ""} /></Field>
      <Field label="Salida"><input type="time" name="hora_salida" className="input" defaultValue={parte?.hora_salida?.slice(0, 5) ?? ""} /></Field>
      <Field label="Tipo de trabajo"><input name="tipo_trabajo" className="input" defaultValue={parte?.tipo_trabajo ?? ""} placeholder="Recolección, poda…" /></Field>
      <Field label="Actividad" wide><input name="actividad" className="input" defaultValue={parte?.actividad ?? ""} /></Field>
      <Field label="Observaciones" wide><input name="observaciones" className="input" defaultValue={parte?.observaciones ?? ""} /></Field>
      <p className="col-span-full text-xs text-stone-500">Si indicas entrada y salida, las horas se calculan a partir de ellas. Sin tarifa, el coste queda vacío (no se estima).</p>
    </ActionForm>
  );
}

export function CosechaForm({ ctx, cosecha }: { ctx: Ctx; cosecha?: any }) {
  return (
    <ActionForm action={guardarCosecha} label={cosecha ? "Guardar corrección" : "Registrar cosecha"} reset={!cosecha} className="grid gap-3 sm:grid-cols-3">
      {cosecha && <input type="hidden" name="id" value={cosecha.id} />}
      <Field label="Fecha *"><input type="date" name="fecha" className="input" required defaultValue={cosecha?.fecha ?? iso(new Date())} /></Field>
      <FincaParcela fincas={ctx.fincas} finca={cosecha?.finca_id} parcela={cosecha?.parcela_id} parcelaObligatoria />
      <Field label="Cultivo *"><input name="cultivo" className="input" required defaultValue={cosecha?.cultivo ?? ""} placeholder="Mango" /></Field>
      <Field label="Variedad"><input name="variedad" className="input" defaultValue={cosecha?.variedad ?? ""} placeholder="Osteen" /></Field>
      <Field label="Kilogramos *"><input name="kg" inputMode="decimal" className="input" required defaultValue={cosecha?.kg ?? ""} /></Field>
      <Field label="Cajas"><input name="cajas" inputMode="numeric" className="input" defaultValue={cosecha?.cajas ?? ""} /></Field>
      <Field label="Campaña">
        <select name="campana_id" className="input" defaultValue={cosecha?.campana_id ?? ""}><option value="">—</option>{ctx.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
      </Field>
      <Field label="Equipo de recolección">
        <select name="equipo_id" className="input" defaultValue={cosecha?.equipo_id ?? ""}><option value="">—</option>{ctx.equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select>
      </Field>
      <Field label="Calibre"><input name="calibre" className="input" defaultValue={cosecha?.calibre ?? ""} /></Field>
      <Field label="Calidad / categoría"><input name="calidad" className="input" defaultValue={cosecha?.calidad ?? ""} /></Field>
      <Field label="Destino"><input name="destino" className="input" defaultValue={cosecha?.destino ?? ""} /></Field>
      <Field label="Observaciones" wide><input name="observaciones" className="input" defaultValue={cosecha?.observaciones ?? ""} /></Field>
    </ActionForm>
  );
}

export const CATEGORIAS: [string, string][] = [
  ["mano_obra", "Mano de obra"], ["insumos", "Insumos y productos agrícolas"], ["maquinaria", "Maquinaria"],
  ["combustible", "Combustible"], ["semillas_plantas", "Semillas y plantas"], ["riego_agua", "Riego y agua"],
  ["herramientas", "Herramientas y equipos"], ["transporte", "Transporte"], ["otros", "Otros gastos"],
];
export const TIPOS_IMPORTE: [string, string][] = [
  ["registrado", "Registrado (gasto real)"], ["presupuesto", "Presupuesto"], ["estimacion", "Estimación"], ["prevision", "Previsión"],
];

export function GastoForm({ ctx, gasto, documentos = [] }: { ctx: Ctx; gasto?: any; documentos?: { id: string; nombre: string }[] }) {
  return (
    <ActionForm action={guardarGasto} label={gasto ? "Guardar corrección" : "Registrar gasto"} reset={!gasto} className="grid gap-3 sm:grid-cols-3">
      {gasto && <input type="hidden" name="id" value={gasto.id} />}
      <Field label="Fecha *"><input type="date" name="fecha" className="input" required defaultValue={gasto?.fecha ?? iso(new Date())} /></Field>
      <FincaParcela fincas={ctx.fincas} finca={gasto?.finca_id} parcela={gasto?.parcela_id} />
      <Field label="Categoría *">
        <select name="categoria" className="input" required defaultValue={gasto?.categoria ?? ""}><option value="">Elige…</option>{CATEGORIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
      </Field>
      <Field label="Importe *"><input name="importe" inputMode="decimal" className="input" required defaultValue={gasto?.importe ?? ""} /></Field>
      <Field label="Moneda"><input name="moneda" className="input" maxLength={3} defaultValue={gasto?.moneda ?? "EUR"} /></Field>
      <Field label="Naturaleza del importe">
        <select name="tipo_importe" className="input" defaultValue={gasto?.tipo_importe ?? "registrado"}>{TIPOS_IMPORTE.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
      </Field>
      <Field label="Proveedor"><input name="proveedor" className="input" defaultValue={gasto?.proveedor ?? ""} /></Field>
      <Field label="Campaña">
        <select name="campana_id" className="input" defaultValue={gasto?.campana_id ?? ""}><option value="">—</option>{ctx.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
      </Field>
      <Field label="Documento justificativo">
        <select name="documento_id" className="input" defaultValue={gasto?.documento_id ?? ""}><option value="">— sin documento —</option>{documentos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select>
      </Field>
      <Field label="Concepto" wide><input name="concepto" className="input" defaultValue={gasto?.concepto ?? ""} /></Field>
      <Field label="Observaciones" wide><input name="observaciones" className="input" defaultValue={gasto?.observaciones ?? ""} /></Field>
    </ActionForm>
  );
}
