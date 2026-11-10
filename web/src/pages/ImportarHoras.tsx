import { useState } from "react";
import { useAuth } from "../auth";
import { db } from "../supabase";
import { Navigate } from "../router";
import { Field, useCarga } from "../ui";
import { iso } from "../lib/format";
import { leerFilasHoras, type LineaImportacion } from "../lib/importacion-horas";
import { partesPeriodo } from "../lib/leer-operativa";
import RevisionImportacion, { type TrabImportacion } from "../components/RevisionImportacion";
import type { ParteOperativo } from "../lib/operativa";
export default function ImportarHoras() {
  const { fincas, esAdmin, cargando: authCargando } = useAuth();
  const hoy = iso(new Date());
  const [desde, setDesde] = useState(hoy.slice(0, 7) + "-01"), [hasta, setHasta] = useState(hoy);
  const [cargando, setCargando] = useState(false), [error, setError] = useState(""), [nota, setNota] = useState("");
  const [revision, setRevision] = useState<{ id: number; lineas: LineaImportacion[]; existentes: ParteOperativo[] } | null>(null);
  const personal = useCarga(async () => {
    if (!esAdmin) return [] as TrabImportacion[];
    const r = await db.from("trabajadores").select("id,codigo,nombre,activo,trabajadores_fincas(finca_id,activo)").eq("activo", true).order("nombre");
    if (r.error) throw new Error(r.error.message); return r.data as TrabImportacion[];
  }, [esAdmin]);
  async function leer(files: FileList | null) {
    if (!esAdmin || !files?.length) return;
    setCargando(true); setError(""); setRevision(null); setNota("");
    try {
      if (!desde || !hasta || hasta < desde || hasta > hoy) throw new Error("Elige un periodo válido hasta hoy antes de subir los archivos.");
      const XLSX = await import("xlsx");
      let todas: LineaImportacion[] = []; const hojas: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: el archivo supera 20 MB.`);
        const w = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const datos = w.SheetNames.find((n) => n.trim().toUpperCase() === "DATOS");
        const horas = w.SheetNames.find((n) => n.trim().toUpperCase() === "HORAS");
        const elegidas = datos ? [datos] : horas ? [horas] : w.SheetNames.filter((n) => !/resumen|tractor|detalle/i.test(n));
        for (const name of elegidas) {
          const raw = XLSX.utils.sheet_to_json<unknown[]>(w.Sheets[name], { header: 1, raw: true, defval: null });
          const ll = leerFilasHoras(raw, file.name, name); todas.push(...ll); hojas.push(`${file.name}: ${name}`);
        }
      }
      const fuera = todas.filter((l) => l.fecha && (l.fecha < desde || l.fecha > hasta)).length;
      todas = todas.filter((l) => !l.fecha || (l.fecha >= desde && l.fecha <= hasta));
      if (!todas.length) throw new Error("No hay horas dentro del periodo elegido.");
      if (todas.length > 1000) throw new Error("Hay más de 1000 líneas. Importa un periodo más corto.");
      const existentes = await partesPeriodo(desde, hasta);
      setRevision({ id: Date.now(), lineas: todas, existentes });
      setNota(`Hojas leídas: ${hojas.join("; ")}.${fuera ? ` Se han excluido ${fuera} líneas fuera del periodo.` : ""}`);
    } catch (e) { setError((e as Error).message); }
    setCargando(false);
  }
  if (authCargando) return null;
  if (!esAdmin) return <Navigate to="/ayer" />;
  return <div className="mx-auto max-w-7xl space-y-4"><h1 className="text-xl font-semibold">Importar horas de Excel</h1>
    <p className="text-sm">Admite las hojas de FRUNET, LOMAS y PAI y la exportación del Historial. Si existe una hoja DATOS, se utiliza esa hoja; no se importan los resúmenes. No se cambian las fichas, las tarifas ni las fincas activas.</p>
    <div className="card grid gap-3 sm:grid-cols-3"><Field label="Desde"><input className="input" type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setRevision(null); }} /></Field><Field label="Hasta"><input className="input" type="date" max={hoy} value={hasta} onChange={(e) => { setHasta(e.target.value); setRevision(null); }} /></Field><Field label="Archivos Excel"><input type="file" accept=".xlsx,.xls" multiple disabled={cargando || personal.cargando || !!personal.error} onChange={(e) => { leer(e.target.files); e.target.value = ""; }} /></Field></div>
    {(error || personal.error) && <p role="alert" className="card text-red-700">{error || personal.error}</p>}
    {cargando && <p role="status">Leyendo archivos y comprobando las horas existentes…</p>}
    {nota && <p className="text-xs text-stone-600">{nota}</p>}
    {revision && personal.datos && <RevisionImportacion key={revision.id} lineas={revision.lineas} existentes={revision.existentes} trabajadores={personal.datos} fincas={fincas} alGuardar={() => {}} />}
  </div>;
}
