import { useState } from "react";
import { Navigate } from "../router";
import { useAuth } from "../auth";
import { db } from "../supabase";
import { Field, useCarga } from "../ui";
import { NOMBRES_MAYOR, TAREAS_HORAS } from "../lib/horas";
import { fecha, iso, num } from "../lib/format";

type Fila = {
  id: string; fecha: string; mayor: string | null; tipo_trabajo: string | null; actividad: string | null; num_trabajadores: number;
  horas_totales: number; horas_extra_totales: number; trabajador_nombre: string | null;
  trabajadores: { codigo: string | null; nombre: string } | null; fincas: { nombre: string } | null;
};
type Tractor = { id: string; fecha: string; horas: number; observaciones: string | null; fincas: { nombre: string } | null };

const MOSTRAR = 500;
const nombreDe = (p: Fila) => p.trabajadores?.nombre ?? p.trabajador_nombre ?? (p.num_trabajadores > 1 ? `Sin nombre (${p.num_trabajadores} personas)` : "Sin nombre");

async function todas<T>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; a < 100000; a += 1000) {
    const { data, error } = await q(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** Historial completo de horas con filtros y exportación a Excel/CSV. Solo administrador y encargado; cada uno ve lo de sus fincas. Sin costes. */
export default function Historial() {
  const { perfil, fincas, cargando: cargandoAuth } = useAuth();
  const hoy = new Date();
  const [f, setF] = useState({ desde: iso(new Date(hoy.getTime() - 29 * 864e5)), hasta: iso(hoy), finca: "", trabajador: "", mayor: "", tarea: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const [exportando, setExportando] = useState(false);

  const { datos, error, cargando } = useCarga(async () => {
    const filas = await todas<Fila>((a, b) => {
      let q = db.from("partes_trabajo")
        .select("id,fecha,mayor,tipo_trabajo,actividad,num_trabajadores,horas_totales,horas_extra_totales,trabajador_nombre,trabajadores(codigo,nombre),fincas(nombre)")
        .order("fecha", { ascending: false }).order("id").range(a, b);
      if (f.desde) q = q.gte("fecha", f.desde);
      if (f.hasta) q = q.lte("fecha", f.hasta);
      if (f.finca) q = q.eq("finca_id", f.finca);
      if (f.mayor) q = q.eq("mayor", f.mayor);
      if (f.tarea) q = q.eq("tipo_trabajo", f.tarea);
      return q as unknown as PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>;
    });
    // El tractor es del día y la finca (no del personal): solo sale si no se filtra por trabajador, mayor ni tarea
    let tractor: Tractor[] = [];
    if (!f.trabajador.trim() && !f.mayor && !f.tarea) {
      let qt = db.from("horas_tractor").select("id,fecha,horas,observaciones,fincas(nombre)").order("fecha", { ascending: false }).limit(2000);
      if (f.desde) qt = qt.gte("fecha", f.desde);
      if (f.hasta) qt = qt.lte("fecha", f.hasta);
      if (f.finca) qt = qt.eq("finca_id", f.finca);
      tractor = ((await qt).data ?? []) as unknown as Tractor[];
    }
    return { filas, tractor };
  }, [f.desde, f.hasta, f.finca, f.mayor, f.tarea, f.trabajador.trim() === ""]);

  if (cargandoAuth) return null;
  if (perfil?.rol !== "administrador" && perfil?.rol !== "encargado") return <Navigate to="/horas" />;

  const txt = f.trabajador.trim().toLowerCase();
  const filas = (datos?.filas ?? []).filter((p) => !txt || `${p.trabajadores?.codigo ?? ""} ${nombreDe(p)}`.toLowerCase().includes(txt));
  const tractor = txt ? [] : datos?.tractor ?? [];
  const horas = filas.reduce((a, p) => a + Number(p.horas_totales ?? 0), 0);
  const extra = filas.reduce((a, p) => a + Number(p.horas_extra_totales ?? 0), 0);
  const horasTractor = tractor.reduce((a, t) => a + Number(t.horas ?? 0), 0);

  const hojaHoras = () => [["Fecha", "Código", "Trabajador", "Finca", "Mayor", "Tarea", "Observaciones", "Horas", "Horas extra"],
    ...filas.map((p) => [fecha(p.fecha), p.trabajadores?.codigo ?? "", nombreDe(p), p.fincas?.nombre ?? "", p.mayor ?? "", p.tipo_trabajo ?? "", p.actividad ?? "", Number(p.horas_totales ?? 0), Number(p.horas_extra_totales ?? 0)])];
  const hojaTractor = () => [["Fecha", "Finca", "Horas", "Observaciones"], ...tractor.map((t) => [fecha(t.fecha), t.fincas?.nombre ?? "", Number(t.horas), t.observaciones ?? ""])];
  const hojaResumen = () => {
    const m = new Map<string, { codigo: string; nombre: string; dias: Set<string>; horas: number; extra: number }>();
    for (const p of filas) {
      const k = `${p.trabajadores?.codigo ?? ""}|${nombreDe(p)}`;
      const g = m.get(k) ?? { codigo: p.trabajadores?.codigo ?? "", nombre: nombreDe(p), dias: new Set<string>(), horas: 0, extra: 0 };
      g.dias.add(p.fecha); g.horas += Number(p.horas_totales ?? 0); g.extra += Number(p.horas_extra_totales ?? 0); m.set(k, g);
    }
    return [["Código", "Trabajador", "Días", "Horas", "Horas extra"], ...[...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((g) => [g.codigo, g.nombre, g.dias.size, Math.round(g.horas * 100) / 100, Math.round(g.extra * 100) / 100])];
  };
  const nombreArchivo = (ext: string) => `horas_${f.desde || "inicio"}_${f.hasta || "hoy"}.${ext}`;

  async function excel() {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const libro = XLSX.utils.book_new();
      const anadir = (nombre: string, filasHoja: (string | number)[][], anchos: number[]) => {
        const h = XLSX.utils.aoa_to_sheet(filasHoja);
        h["!cols"] = anchos.map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(libro, h, nombre);
      };
      anadir("Horas", hojaHoras(), [11, 8, 34, 16, 24, 20, 44, 8, 11]);
      anadir("Resumen por trabajador", hojaResumen(), [8, 34, 7, 9, 11]);
      if (tractor.length) anadir("Tractor", hojaTractor(), [11, 16, 8, 40]);
      XLSX.writeFile(libro, nombreArchivo("xlsx"));
    } finally { setExportando(false); }
  }
  function csv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linea = (l: (string | number)[]) => l.map((v) => esc(typeof v === "number" ? String(v).replace(".", ",") : v)).join(";");
    const blob = new Blob(["﻿" + hojaHoras().map(linea).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombreArchivo("csv"); a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Historial de horas</h1>
        <p className="text-sm text-stone-500">Todas las horas registradas, con filtros. Solo consulta: para corregir algo reciente usa «Últimos 7 días». {perfil?.rol === "encargado" ? "Ves lo de tus fincas." : ""}</p>
      </div>

      <div className="card grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Desde"><input type="date" className="input" value={f.desde} max={f.hasta || undefined} onChange={set("desde")} /></Field>
        <Field label="Hasta"><input type="date" className="input" value={f.hasta} min={f.desde || undefined} onChange={set("hasta")} /></Field>
        <Field label="Finca"><select className="input" value={f.finca} onChange={set("finca")}><option value="">Todas</option>{fincas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
        <Field label="Trabajador (código o nombre)"><input className="input" value={f.trabajador} onChange={set("trabajador")} placeholder="Ej.: 3004" /></Field>
        <Field label="Mayor"><select className="input" value={f.mayor} onChange={set("mayor")}><option value="">Todos</option>{NOMBRES_MAYOR.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
        <Field label="Tarea"><select className="input" value={f.tarea} onChange={set("tarea")}><option value="">Todas</option>{TAREAS_HORAS.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
      </div>

      {error && <p role="alert" className="rounded bg-white px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>{cargando ? "Cargando…" : <>{filas.length} registros · <b>{num(horas, 2)} h</b>{extra > 0 && <> (de ellas {num(extra, 2)} extra)</>}{tractor.length > 0 && <> · 🚜 {num(horasTractor, 2)} h de tractor</>}</>}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={exportando || cargando || (!filas.length && !tractor.length)} onClick={excel}>{exportando ? "Preparando…" : "⬇ Exportar a Excel"}</button>
          <button type="button" className="btn-ghost" disabled={cargando || !filas.length} onClick={csv}>⬇ CSV</button>
        </span>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["Fecha", "Código", "Trabajador", "Finca", "Mayor", "Tarea", "Horas", "Extra"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {filas.slice(0, MOSTRAR).map((p) => (
              <tr key={p.id}>
                <td className="td whitespace-nowrap">{fecha(p.fecha)}</td><td className="td">{p.trabajadores?.codigo ?? "—"}</td><td className="td">{nombreDe(p)}</td>
                <td className="td">{p.fincas?.nombre}</td><td className="td">{p.mayor ?? "—"}</td>
                <td className="td">{p.tipo_trabajo ?? "—"}{p.actividad && <span className="block text-xs text-stone-500">{p.actividad}</span>}</td>
                <td className="td text-right">{num(p.horas_totales, 2)}</td><td className="td text-right">{Number(p.horas_extra_totales) > 0 ? num(p.horas_extra_totales, 2) : "—"}</td>
              </tr>
            ))}
            {!filas.length && !cargando && <tr><td className="td text-center" colSpan={8}>Sin registros para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      {filas.length > MOSTRAR && <p className="text-xs text-stone-600">Se muestran los {MOSTRAR} más recientes de {filas.length}; el Excel lleva todos.</p>}

      {tractor.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <p className="px-3 pt-3 text-sm font-bold">🚜 Horas de tractor <span className="font-normal text-stone-600">· {num(horasTractor, 2)} h (por día y finca; no cuentan como horas del personal)</span></p>
          <table className="mt-2 w-full">
            <thead><tr>{["Fecha", "Finca", "Horas", "Observaciones"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{tractor.map((t) => <tr key={t.id}><td className="td">{fecha(t.fecha)}</td><td className="td">{t.fincas?.nombre}</td><td className="td text-right">{num(t.horas, 2)}</td><td className="td">{t.observaciones ?? "—"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
