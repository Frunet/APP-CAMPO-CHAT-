import Link from "next/link";
import { cargarContexto } from "@/lib/datos";
import { crearEsperado, recibirEsperado } from "@/lib/actions";
import ActionForm, { Field } from "@/components/ActionForm";
import SubirDocumento from "@/components/SubirDocumento";
import { fecha } from "@/lib/format";

type Q = { q?: string; tipo?: string; finca?: string; desde?: string; hasta?: string; estado?: string };
const TIPOS = ["factura", "albaran", "parte_trabajo", "informe_cosecha", "foto", "otro"];

export default async function Documentos({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const ctx = await cargarContexto();

  let qb = ctx.db.from("documentos")
    .select("id,nombre,tipo,estado,fecha_documento,created_at,tamano_bytes,fincas(nombre)")
    .order("created_at", { ascending: false }).limit(200);
  if (q.tipo) qb = qb.eq("tipo", q.tipo);
  if (q.finca) qb = qb.eq("finca_id", q.finca);
  if (q.estado) qb = qb.eq("estado", q.estado);
  if (q.desde) qb = qb.gte("fecha_documento", q.desde);
  if (q.hasta) qb = qb.lte("fecha_documento", q.hasta);
  // Búsqueda en nombre y contenido; se limpian caracteres que alteran el filtro
  const texto = q.q?.replace(/[%*,()\\]/g, " ").trim();
  if (texto) qb = qb.or(`nombre.ilike.%${texto}%,texto_extraido.ilike.%${texto}%`);

  const [{ data: docs }, { data: esperados }, { data: recientes }] = await Promise.all([
    qb,
    ctx.db.from("documentos_esperados").select("id,descripcion,tipo,fecha_esperada,fincas(nombre)").is("documento_id", null).order("fecha_esperada", { nullsFirst: false }),
    ctx.db.from("documentos").select("id,nombre").order("created_at", { ascending: false }).limit(50),
  ]);
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Documentos</h1>

      {ctx.puedeRegistrar && (
        <details className="card" open>
          <summary className="cursor-pointer text-sm font-medium text-brand-700">＋ Subir documento</summary>
          <div className="mt-3"><SubirDocumento fincas={ctx.fincas} /></div>
          <p className="mt-2 text-xs text-stone-500">El original se guarda sin modificar. Los datos que se lean aparecerán para revisarlos y corregirlos antes de importar nada.</p>
        </details>
      )}

      <section className="card">
        <h2 className="mb-2 font-medium">Pendientes de recibir ({esperados?.length ?? 0})</h2>
        {esperados?.length ? (
          <ul className="space-y-2">
            {esperados.map((e: any) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className={e.fecha_esperada && e.fecha_esperada < hoy ? "text-red-600" : ""}>
                  • {e.fincas?.nombre}: {e.descripcion} {e.fecha_esperada ? `(esperado ${fecha(e.fecha_esperada)})` : ""}
                </span>
                {ctx.puedeGestionar && (
                  <ActionForm action={recibirEsperado} label="Marcar recibido" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={e.id} />
                    <select name="documento_id" className="input !w-52" required><option value="">Documento recibido…</option>{recientes?.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-stone-500">No hay documentos pendientes.</p>}
        {ctx.puedeGestionar && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-brand-700">＋ Anotar documento que debe llegar</summary>
            <div className="mt-2">
              <ActionForm action={crearEsperado} label="Anotar" className="grid gap-3 sm:grid-cols-4">
                <Field label="Finca *"><select name="finca_id" className="input" required><option value="">Elige…</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
                <Field label="Descripción *"><input name="descripcion" className="input" required placeholder="Informe de cosecha de mayo" /></Field>
                <Field label="Tipo"><select name="tipo" className="input">{TIPOS.map((t) => <option key={t}>{t}</option>)}</select></Field>
                <Field label="Fecha esperada"><input type="date" name="fecha_esperada" className="input" /></Field>
              </ActionForm>
            </div>
          </details>
        )}
      </section>

      <form method="get" className="card grid gap-3 sm:grid-cols-6">
        <Field label="Buscar en nombre y contenido" wide><input name="q" className="input" defaultValue={q.q ?? ""} placeholder="proveedor, número de factura…" /></Field>
        <Field label="Tipo"><select name="tipo" className="input" defaultValue={q.tipo ?? ""}><option value="">Todos</option>{TIPOS.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Finca"><select name="finca" className="input" defaultValue={q.finca ?? ""}><option value="">Todas</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
        <Field label="Estado"><select name="estado" className="input" defaultValue={q.estado ?? ""}><option value="">Todos</option>{["subido", "procesado", "revisado", "importado", "descartado"].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Fecha doc. desde"><input type="date" name="desde" className="input" defaultValue={q.desde ?? ""} /></Field>
        <Field label="Hasta"><input type="date" name="hasta" className="input" defaultValue={q.hasta ?? ""} /></Field>
        <div className="flex items-end"><button className="btn w-full">Buscar</button></div>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Nombre", "Tipo", "Finca", "Fecha doc.", "Subido", "Estado", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {docs?.map((d: any) => (
              <tr key={d.id}>
                <td className="td max-w-[16rem] truncate">{d.nombre}</td><td className="td">{d.tipo}</td><td className="td">{d.fincas?.nombre ?? "—"}</td>
                <td className="td">{d.fecha_documento ? fecha(d.fecha_documento) : "—"}</td>
                <td className="td">{new Date(d.created_at).toLocaleDateString("es-ES")}</td>
                <td className="td">{d.estado}</td>
                <td className="td whitespace-nowrap"><Link className="text-brand-700" href={`/documentos/${d.id}`}>Abrir</Link> · <a className="text-brand-700" href={`/api/documentos/${d.id}/descargar`}>Descargar</a></td>
              </tr>
            ))}
            {!docs?.length && <tr><td className="td text-stone-500" colSpan={7}>Sin documentos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
