"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ActionForm from "./ActionForm";
import type { FincaOpt } from "./FincaParcela";
import { createClient } from "@/lib/supabase/browser";
import { importarHoras } from "@/lib/actions";

type Reg = { fecha: string | null; finca_ref: string | null; trabajador_nombre: string; horas: number | null; horas_extra: number; tipo_trabajo: string | null; hoja: string; fila: number; dudas: string[] };

const nm = (x: unknown) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const sinParentesis = (x: unknown) => nm(String(x ?? "").replace(/\(.*?\)/g, " "));
const r1 = (n: number) => Math.round(n * 10) / 10;
const dmy = (s: string) => s.split("-").reverse().join("/");

/**
 * Tarjeta de una hoja de horas (Excel): en vez de 100+ filas sueltas se revisa por grupos —a qué finca va cada nombre de finca de la hoja y qué
 * trabajadores existen en Maestros— y se importa todo de una vez. Los trabajadores sin alta se guardan con su nombre y sin tarifa.
 */
export default function RevisionHoras({
  documentoId, fincas, registros, importados, puedeImportar, alTerminar,
}: { documentoId: string; fincas: FincaOpt[]; registros: Reg[]; importados: number[]; puedeImportar: boolean; alTerminar: () => void }) {
  const db = useRef(createClient()).current;
  const [personal, setPersonal] = useState<string[] | null>(null);
  useEffect(() => { db.from("trabajadores").select("nombre").eq("activo", true).then(({ data }) => setPersonal((data ?? []).map((t: any) => t.nombre))); }, [db]);

  const pendientes = useMemo(() => registros.map((r, i) => ({ r, i })).filter(({ i }) => !importados.includes(i)), [registros, importados]);
  const grupos = useMemo(() => {
    const m = new Map<string, { ref: string; lineas: number; horas: number }>();
    for (const { r } of pendientes) {
      const k = r.finca_ref ?? "";
      const g = m.get(k) ?? { ref: k, lineas: 0, horas: 0 };
      g.lineas++; g.horas += r.horas ?? 0; m.set(k, g);
    }
    return [...m.values()];
  }, [pendientes]);

  const sugerida = (ref: string) => {
    const n = nm(ref); if (!n) return "";
    const ex = fincas.filter((f) => nm(f.nombre) === n);
    if (ex.length === 1) return ex[0].id;
    const parcial = fincas.filter((f) => nm(f.nombre).includes(n) || n.includes(nm(f.nombre)));
    return parcial.length === 1 ? parcial[0].id : "";
  };
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const fincaDe = (ref: string) => mapa[ref] ?? sugerida(ref);

  const trabajadores = useMemo(() => {
    const m = new Map<string, { nombre: string; lineas: number; horas: number }>();
    for (const { r } of pendientes) {
      const k = nm(r.trabajador_nombre);
      const g = m.get(k) ?? { nombre: r.trabajador_nombre, lineas: 0, horas: 0 };
      g.lineas++; g.horas += r.horas ?? 0; m.set(k, g);
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [pendientes]);
  const enMaestros = (nombre: string) => !!personal?.some((p) => nm(p) === nm(nombre) || sinParentesis(p) === sinParentesis(nombre));

  if (!pendientes.length) return <p className="text-xs font-semibold text-green-700">✔ Todas las líneas de horas están importadas.</p>;

  const fechas = pendientes.map(({ r }) => r.fecha).filter(Boolean).sort() as string[];
  const horas = pendientes.reduce((a, { r }) => a + (r.horas ?? 0), 0);
  const extra = pendientes.reduce((a, { r }) => a + (r.horas_extra ?? 0), 0);
  const conDudas = pendientes.filter(({ r }) => r.dudas.length);
  const sinAlta = trabajadores.filter((t) => personal && !enMaestros(t.nombre));
  const listos = grupos.filter((g) => fincaDe(g.ref)).reduce((a, g) => a + g.lineas, 0);
  const payload = JSON.stringify(Object.fromEntries(grupos.map((g) => [g.ref, fincaDe(g.ref) || null])));

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-stone-700">
        <b>{pendientes.length}</b> líneas de horas · <b>{trabajadores.length}</b> trabajadores · <b>{r1(horas)}</b> h{extra ? ` (${r1(extra)} extra)` : ""}
        {fechas.length ? ` · del ${dmy(fechas[0])} al ${dmy(fechas[fechas.length - 1])}` : ""}. Cada línea será un parte de un trabajador en un día.
      </p>

      <div className="rounded-lg border border-stone-200 p-2">
        <p className="mb-1 text-xs font-medium text-stone-600">¿A qué finca va cada una?</p>
        {grupos.map((g) => (
          <label key={g.ref} className="mb-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="min-w-32 font-medium">«{g.ref || "sin finca"}»</span>
            <span className="text-stone-500">{g.lineas} líneas · {r1(g.horas)} h →</span>
            <select className={`input !w-auto !py-1 ${fincaDe(g.ref) ? "" : "!border-red-400"}`} value={fincaDe(g.ref)} disabled={!puedeImportar}
              onChange={(e) => setMapa((m) => ({ ...m, [g.ref]: e.target.value }))}>
              <option value="">— elegir finca —</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </label>
        ))}
        {grupos.some((g) => !fincaDe(g.ref)) && (
          <p className="mt-1 text-xs text-stone-500">Si la finca no existe todavía, díselo al chat («da de alta la finca …») y pulsa ↻ arriba para que aparezca aquí.</p>
        )}
      </div>

      <details className="rounded-lg border border-stone-200 p-2">
        <summary className="cursor-pointer text-xs font-medium text-stone-600">
          Trabajadores ({trabajadores.length}){personal ? ` · ${trabajadores.length - sinAlta.length} dados de alta, ${sinAlta.length} sin alta` : ""}
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead><tr><th className="th">Nombre</th><th className="th text-right">Líneas</th><th className="th text-right">Horas</th><th className="th">En Maestros</th></tr></thead>
          <tbody>{trabajadores.map((t) => (
            <tr key={t.nombre}><td className="td">{t.nombre}</td><td className="td text-right">{t.lineas}</td><td className="td text-right">{r1(t.horas)}</td>
              <td className="td">{personal == null ? "…" : enMaestros(t.nombre) ? "✔ con su tarifa" : "⚠ sin alta (sin tarifa)"}</td></tr>
          ))}</tbody>
        </table>
        {sinAlta.length > 0 && <p className="mt-1 text-xs text-stone-500">Los que no están dados de alta se importan igualmente con su nombre, pero sin coste. Puedes darlos de alta con el chat («da de alta a … a … €/h») antes o después.</p>}
      </details>

      {conDudas.length > 0 && (
        <details className="rounded-lg border border-amber-300 bg-amber-50 p-2">
          <summary className="cursor-pointer text-xs font-medium text-amber-800">{conDudas.length} línea(s) con avisos</summary>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-900">
            {conDudas.slice(0, 40).map(({ r, i }) => <li key={i}>{r.hoja} fila {r.fila} · {r.fecha ? dmy(r.fecha) : "sin fecha"} · {r.trabajador_nombre}: {r.dudas.join(" ")}</li>)}
            {conDudas.length > 40 && <li>…y {conDudas.length - 40} más.</li>}
          </ul>
        </details>
      )}

      {puedeImportar ? (
        <ActionForm action={importarHoras} label={`Importar ${listos} línea(s) de horas`} reset={false} className="flex flex-wrap items-center gap-3"
          confirmar={`Se crearán ${listos} partes de trabajo (uno por trabajador y día). ¿Importar?`} alTerminar={alTerminar}>
          <input type="hidden" name="documento_id" value={documentoId} />
          <input type="hidden" name="mapa" value={payload} />
        </ActionForm>
      ) : <p className="text-xs text-stone-500">Tu rol no permite importar registros.</p>}
      <p className="text-xs text-stone-500">Lo que ya exista (mismo trabajador, día, finca y trabajo) no se duplica. Las horas son las imputables a la finca de cada línea.</p>
    </div>
  );
}
