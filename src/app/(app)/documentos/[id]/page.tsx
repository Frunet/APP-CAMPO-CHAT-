import Link from "next/link";
import { notFound } from "next/navigation";
import { cargarContexto } from "@/lib/datos";
import { actualizarDocumento, descartarDocumento } from "@/lib/actions";
import ActionForm, { Field } from "@/components/ActionForm";
import FincaParcela from "@/components/FincaParcela";
import Historial from "@/components/Historial";
import RevisionTabla from "@/components/RevisionTabla";
import ReintentarLectura from "@/components/ReintentarLectura";

const TIPOS = ["factura", "albaran", "parte_trabajo", "informe_cosecha", "foto", "otro"];

export default async function Documento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await cargarContexto();
  const { data: doc } = await ctx.db.from("documentos").select("*, fincas(nombre), gastos(id,fecha,importe,moneda)").eq("id", id).maybeSingle();
  if (!doc) notFound();

  const ext = doc.datos_extraidos as { resumen?: string; registros?: Record<string, any>[]; importados?: number[]; proveedor?: string } | null;
  const pendiente = doc.estado === "subido" || (doc.estado === "procesado" && !ext);
  const esImagen = doc.mime?.startsWith("image/");

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/documentos" className="text-sm text-brand-700">← Documentos</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="break-all text-xl font-semibold">{doc.nombre}</h1>
        <a href={`/api/documentos/${id}/descargar`} className="btn-ghost">⬇ Descargar original</a>
      </div>
      <p className="text-sm text-stone-500">
        Estado: <b>{doc.estado}</b> · {doc.tipo} · {doc.fincas?.nombre ?? "sin finca"} · {Math.round((doc.tamano_bytes ?? 0) / 1024)} KB
      </p>

      {ctx.puedeRegistrar && (
        <section className="card space-y-2">
          <h2 className="font-medium">Datos leídos del documento</h2>
          {ext?.resumen && <p className="text-sm">{ext.resumen}</p>}
          {pendiente || doc.estado === "descartado" ? <ReintentarLectura id={id} /> : null}
          {ext && doc.estado !== "descartado" && (
            <RevisionTabla
              documentoId={id} fincas={ctx.fincas} fincaInicial={doc.finca_id ?? ""}
              registros={ext.registros ?? []} importados={ext.importados ?? []} puedeImportar={ctx.rol !== "consulta"}
            />
          )}
          {ext && doc.estado !== "importado" && doc.estado !== "descartado" && (
            <ActionForm action={descartarDocumento} label="Descartar lectura" danger className="flex" confirmar="¿Descartar los datos leídos? El archivo original se conserva.">
              <input type="hidden" name="id" value={id} />
            </ActionForm>
          )}
          {ext && doc.estado !== "importado" && <ReintentarLectura id={id} etiqueta="Volver a leer" />}
        </section>
      )}

      {doc.gastos?.length > 0 && (
        <section className="card text-sm">
          <h2 className="mb-1 font-medium">Gastos justificados con este documento</h2>
          {doc.gastos.map((g: any) => <Link key={g.id} href={`/gastos/${g.id}`} className="block text-brand-700">{g.fecha} · {g.importe} {g.moneda}</Link>)}
        </section>
      )}

      <section className="card">
        <h2 className="mb-2 font-medium">Relacionar con finca, parcela y campaña</h2>
        <ActionForm action={actualizarDocumento} label="Guardar" reset={false} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="id" value={id} />
          <FincaParcela fincas={ctx.fincas} finca={doc.finca_id ?? ""} parcela={doc.parcela_id} />
          <Field label="Campaña"><select name="campana_id" className="input" defaultValue={doc.campana_id ?? ""}><option value="">—</option>{ctx.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
          <Field label="Tipo"><select name="tipo" className="input" defaultValue={doc.tipo}>{TIPOS.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Fecha del documento"><input type="date" name="fecha_documento" className="input" defaultValue={doc.fecha_documento ?? ""} /></Field>
        </ActionForm>
      </section>

      {doc.texto_extraido && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-medium">Texto reconocido (usado en las búsquedas)</summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-stone-600">{doc.texto_extraido}</pre>
        </details>
      )}
      {esImagen && <p className="text-xs text-stone-500">Descarga el original para verlo; no se modifica nunca.</p>}
      <section className="card"><h2 className="mb-2 font-medium">Historial</h2><Historial tabla="documentos" id={id} /></section>
    </div>
  );
}
