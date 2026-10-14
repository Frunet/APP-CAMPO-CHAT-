"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { descartarDocumento } from "@/lib/actions";
import ActionForm from "./ActionForm";
import RevisionTabla from "./RevisionTabla";
import type { FincaOpt } from "./FincaParcela";

type Doc = { id: string; nombre: string; estado: string; finca_id: string | null; datos_extraidos: any };

/**
 * Tarjeta del chat para revisar un documento leído: filas editables, finca, importar las marcadas, descartar o descargar el original.
 * El asistente nunca importa: solo la persona, fila a fila.
 */
export default function RevisionDocumento({ id }: { id: string }) {
  const db = useRef(createClient()).current;
  const [doc, setDoc] = useState<Doc | null>(null);
  const [fincas, setFincas] = useState<FincaOpt[]>([]);
  const [rol, setRol] = useState("");
  const [error, setError] = useState("");
  const [leyendo, setLeyendo] = useState(false);

  const cargar = useCallback(async () => {
    const [d, f, u] = await Promise.all([
      db.from("documentos").select("id,nombre,estado,finca_id,datos_extraidos").eq("id", id).maybeSingle(),
      db.from("fincas").select("id,nombre,parcelas(id,codigo,nombre)").eq("activa", true).order("nombre"),
      db.auth.getUser(),
    ]);
    if (!d.data) return setError("No encuentro este documento (o no tienes acceso).");
    setDoc(d.data as Doc);
    setFincas((f.data ?? []) as unknown as FincaOpt[]);
    if (u.data.user) { const p = await db.from("profiles").select("rol").eq("id", u.data.user.id).maybeSingle(); setRol(p.data?.rol ?? ""); }
  }, [db, id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function leer() {
    setLeyendo(true); setError("");
    const r = await fetch(`/api/documentos/${id}/procesar`, { method: "POST" });
    const j = await r.json();
    setLeyendo(false);
    if (!r.ok) return setError(j.error ?? "No se pudo leer el documento.");
    cargar();
  }

  if (error && !doc) return <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>;
  if (!doc) return <p className="text-xs text-stone-500">Cargando documento…</p>;

  const ext = doc.datos_extraidos as { resumen?: string; registros?: Record<string, any>[]; importados?: number[] } | null;
  const importados = ext?.importados ?? [];
  const abierto = doc.estado !== "importado" && doc.estado !== "descartado";

  return (
    <div className="w-full space-y-2 rounded-lg border border-stone-300 bg-white p-3 text-stone-900">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <b className="break-all">📄 {doc.nombre}</b>
        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{doc.estado}</span>
        <a href={`/api/documentos/${doc.id}/descargar`} className="ml-auto text-xs text-brand-700">⬇ Descargar original</a>
        <button type="button" onClick={cargar} className="text-xs text-stone-500" title="Actualizar estado">↻</button>
      </div>
      {ext?.resumen && <p className="text-xs text-stone-600">{ext.resumen}</p>}

      {doc.estado === "importado" && <p className="text-xs font-semibold text-green-700">✔ Todas las filas están importadas.</p>}
      {doc.estado === "descartado" && <p className="text-xs text-stone-500">Lectura descartada; el archivo original se conserva.</p>}

      {!ext && abierto && (
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost !px-3 !py-1 !text-xs" onClick={leer} disabled={leyendo}>{leyendo ? "Leyendo…" : "Leer el documento"}</button>
          <span className="text-xs text-stone-500">Aún no se ha leído.</span>
        </div>
      )}
      {ext && abierto && (
        <RevisionTabla
          key={`${doc.estado}-${importados.length}`}
          documentoId={doc.id} fincas={fincas} fincaInicial={doc.finca_id ?? ""}
          registros={ext.registros ?? []} importados={importados} puedeImportar={rol !== "" && rol !== "consulta"}
        />
      )}
      {ext && abierto && importados.length > 0 && (
        <button type="button" onClick={cargar} className="text-xs text-brand-700">Ya has importado filas: actualizar para ver qué queda</button>
      )}
      {ext && abierto && (
        <ActionForm action={descartarDocumento} label="Descartar la lectura" danger reset={false} className="flex" confirmar="¿Descartar los datos leídos? El archivo original se conserva.">
          <input type="hidden" name="id" value={doc.id} />
        </ActionForm>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
