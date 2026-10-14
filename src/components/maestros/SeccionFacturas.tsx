import { crearEmpresaPropia, crearIdentificadorFinca, eliminarEmpresaPropia, eliminarIdentificadorFinca } from "@/lib/actions";
import ActionForm, { Field } from "../ActionForm";
import type { cargarContexto } from "@/lib/datos";

type Ctx = Awaited<ReturnType<typeof cargarContexto>>;
const TIPOS: [string, string, string][] = [
  ["alias", "Alias / otro nombre", "p. ej. «La Fortaleza»"], ["catastro", "Polígono y parcela catastral", "p. ej. 12 / 345"], ["direccion", "Dirección", "p. ej. Camino del Mango 4"],
  ["cups", "CUPS de luz", "ES00…"], ["contador", "Contador / toma de agua", "nº de contador"], ["matricula", "Matrícula de vehículo o maquinaria", "1234ABC"], ["otro", "Otra referencia", ""],
];
const nombreTipo = Object.fromEntries(TIPOS.map(([k, t]) => [k, t]));

export default async function SeccionFacturas({ ctx }: { ctx: Ctx }) {
  const [{ data: ids }, { data: emp }] = await Promise.all([
    ctx.db.from("finca_identificadores").select("id,finca_id,tipo,valor").order("tipo"),
    ctx.db.from("empresas_propias").select("id,nif,nombre").order("nombre"),
  ]);
  const porFinca = new Map<string, any[]>();
  ((ids ?? []) as any[]).forEach((i) => porFinca.set(i.finca_id, [...(porFinca.get(i.finca_id) ?? []), i]));

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="font-medium">Mis empresas (NIF/CIF)</h2>
        <p className="text-xs text-stone-500">Sirve para saber si una factura es <b>recibida</b> (tu empresa es el cliente → gasto) o <b>emitida</b> (tu empresa es quien factura → venta).</p>
        <div className="flex flex-wrap gap-2">
          {((emp ?? []) as any[]).map((e) => (
            <ActionForm key={e.id} action={eliminarEmpresaPropia} label="Quitar" danger reset={false} className="flex items-center gap-2 rounded-lg border border-stone-200 px-2 py-1 text-sm" confirmar="¿Quitar esta empresa?">
              <input type="hidden" name="id" value={e.id} /><span>{e.nombre} · {e.nif}</span>
            </ActionForm>
          ))}
          {!(emp ?? []).length && <p className="text-sm text-amber-700">Sin empresas: las facturas no se podrán clasificar como emitidas o recibidas.</p>}
        </div>
        <ActionForm action={crearEmpresaPropia} label="Añadir empresa" className="grid gap-3 sm:grid-cols-3">
          <Field label="Nombre *"><input name="nombre" className="input" required /></Field>
          <Field label="NIF/CIF *"><input name="nif" className="input" required /></Field>
        </ActionForm>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Identificadores de cada finca</h2>
        <p className="text-xs text-stone-500">
          Al leer una factura, cada línea se asigna a la finca cuyo nombre, código o identificador aparezca en ella (o en su albarán / cabecera). Si en una factura aparece «CASA» o «FORTALEZA», basta con que existan fincas con esos nombres o un alias igual.
          Una línea sin ningún identificador reconocido queda sin finca y se elige a mano al revisar.
        </p>
        <ActionForm action={crearIdentificadorFinca} label="Añadir identificador" className="grid gap-3 sm:grid-cols-4">
          <Field label="Finca *"><select name="finca_id" className="input" required defaultValue=""><option value="" disabled>Elige…</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
          <Field label="Tipo *"><select name="tipo" className="input" required defaultValue="alias">{TIPOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
          <Field label="Valor *"><input name="valor" className="input" required placeholder="Como aparece en las facturas" /></Field>
        </ActionForm>
      </section>

      {ctx.fincas.map((f) => (
        <section key={f.id} className="card space-y-2">
          <h3 className="text-sm font-medium">{f.nombre} <span className="text-xs font-normal text-stone-500">(reconoce también su nombre y código)</span></h3>
          <div className="flex flex-wrap gap-2">
            {(porFinca.get(f.id) ?? []).map((i) => (
              <ActionForm key={i.id} action={eliminarIdentificadorFinca} label="✕" danger reset={false} className="flex items-center gap-2 rounded-lg border border-stone-200 px-2 py-1 text-sm" confirmar="¿Quitar este identificador?">
                <input type="hidden" name="id" value={i.id} /><span><span className="text-xs text-stone-500">{nombreTipo[i.tipo]}:</span> {i.valor}</span>
              </ActionForm>
            ))}
            {!(porFinca.get(f.id) ?? []).length && <p className="text-xs text-stone-400">Sin identificadores añadidos.</p>}
          </div>
        </section>
      ))}
      {!ctx.fincas.length && <p className="text-sm text-stone-500">Crea antes las fincas.</p>}
    </div>
  );
}
