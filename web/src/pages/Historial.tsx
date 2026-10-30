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
/** Una persona, un día y una finca: las horas de ese día repartidas por mayor (como la hoja de AppCampo). */
type Dia = { fecha: string; codigo: string; nombre: string; finca: string; total: number; por: Map<string, number>; tareas: string[] };

const MOSTRAR = 500;
const SIN = "Sin clasificar";
/** Columnas de la hoja de AppCampo, en su orden: cada una agrupa un mayor. */
const COL_MAYOR = [
  { mayor: "Instalaciones", cab: "Instalación" },
  { mayor: "Suelos", cab: "Suelos (arado, desbroce, hierbas...)" },
  { mayor: "Liado y guiado", cab: "Liado/ Guía de planta" },
  { mayor: "Otros cuidados de planta", cab: "Otros cuidados planta (tala, destalle...)" },
  { mayor: "Riego", cab: "Riego, Abonado y Tratamiento (sulfatos...)" },
  { mayor: "Cosecha", cab: "Cosecha/ Recolección" },
  { mayor: "Otros", cab: "Otros" },
  { mayor: "Revisión finca", cab: "Revisión finca" },
];
const r2 = (n: number) => Math.round(n * 100) / 100;
const nombreBruto = (p: Fila) => p.trabajadores?.nombre ?? p.trabajador_nombre ?? (p.num_trabajadores > 1 ? `Sin nombre (${p.num_trabajadores} personas)` : "Sin nombre");
const PREFIJO = /^(\d+)\s*-\s*/;
/** Código del trabajador: el de su ficha o, si no lo tiene, el número que precede al nombre («3004 - NOMBRE»). */
const codigoDe = (p: Fila) => p.trabajadores?.codigo ?? PREFIJO.exec(nombreBruto(p))?.[1] ?? "";
/** Nombre sin ese número delante cuando ya sale en la columna Código. */
const nombreDe = (p: Fila) => nombreBruto(p).replace(PREFIJO, "");

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
  const filas = (datos?.filas ?? []).filter((p) => !txt || `${codigoDe(p)} ${nombreDe(p)}`.toLowerCase().includes(txt));
  const tractor = txt ? [] : datos?.tractor ?? [];
  const horas = filas.reduce((a, p) => a + Number(p.horas_totales ?? 0), 0);
  const extra = filas.reduce((a, p) => a + Number(p.horas_extra_totales ?? 0), 0);
  const horasTractor = tractor.reduce((a, t) => a + Number(t.horas ?? 0), 0);

  // una fila por persona, día y finca, con las horas por mayor
  const mapa = new Map<string, Dia>();
  for (const p of filas) {
    const codigo = codigoDe(p), nombre = nombreDe(p), finca = p.fincas?.nombre ?? "";
    const k = `${p.fecha}|${codigo}|${nombre}|${finca}`;
    const d = mapa.get(k) ?? { fecha: p.fecha, codigo, nombre, finca, total: 0, por: new Map<string, number>(), tareas: [] };
    const h = Number(p.horas_totales ?? 0);
    d.total += h;
    const m = p.mayor ?? SIN;
    d.por.set(m, (d.por.get(m) ?? 0) + h);
    const t = `${p.tipo_trabajo ?? "Sin tarea"}${p.actividad ? `: ${p.actividad}` : ""}`;
    if (!d.tareas.includes(t)) d.tareas.push(t);
    mapa.set(k, d);
  }
  const dias = [...mapa.values()].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.nombre.localeCompare(b.nombre, "es"));
  const cols = dias.some((d) => d.por.has(SIN)) ? [...COL_MAYOR, { mayor: SIN, cab: "Sin clasificar" }] : COL_MAYOR;
  const sumaCols = (d: Dia) => r2(cols.reduce((a, c) => a + (d.por.get(c.mayor) ?? 0), 0));
  const fechaDate = (s: string) => new Date(`${s}T00:00:00`);
  const nombreArchivo = (ext: string) => `horas_${f.desde || "inicio"}_${f.hasta || "hoy"}.${ext}`;

  /** Hoja principal, con los campos de AppCampo y el código del trabajador. */
  const cabecera = () => ["Fecha", "Código", "Nombre", "Total Horas", "FINCA", ...cols.map((c) => c.cab), "Tareas", "TOTAL"];
  const hojaPrincipal = (conFechaReal: boolean) => [cabecera(), ...dias.map((d) => [
    conFechaReal ? fechaDate(d.fecha) : fecha(d.fecha), d.codigo, d.nombre, r2(d.total), d.finca, ...cols.map((c) => r2(d.por.get(c.mayor) ?? 0)), d.tareas.join(" | "), sumaCols(d),
  ])] as (string | number | Date)[][];
  const hojaDetalle = () => [["Fecha", "Código", "Trabajador", "Finca", "Mayor", "Tarea", "Observaciones", "Horas", "Horas extra"],
    ...filas.map((p) => [fechaDate(p.fecha), codigoDe(p), nombreDe(p), p.fincas?.nombre ?? "", p.mayor ?? "", p.tipo_trabajo ?? "", p.actividad ?? "", Number(p.horas_totales ?? 0), Number(p.horas_extra_totales ?? 0)])] as (string | number | Date)[][];
  const hojaTractor = () => [["Fecha", "Finca", "Horas", "Observaciones"], ...tractor.map((t) => [fechaDate(t.fecha), t.fincas?.nombre ?? "", Number(t.horas), t.observaciones ?? ""])] as (string | number | Date)[][];
  const hojaResumen = () => {
    const m = new Map<string, { codigo: string; nombre: string; dias: Set<string>; horas: number; extra: number }>();
    for (const p of filas) {
      const k = `${codigoDe(p)}|${nombreDe(p)}`;
      const g = m.get(k) ?? { codigo: codigoDe(p), nombre: nombreDe(p), dias: new Set<string>(), horas: 0, extra: 0 };
      g.dias.add(p.fecha); g.horas += Number(p.horas_totales ?? 0); g.extra += Number(p.horas_extra_totales ?? 0); m.set(k, g);
    }
    return [["Código", "Trabajador", "Días", "Horas", "Horas extra"], ...[...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((g) => [g.codigo, g.nombre, g.dias.size, r2(g.horas), r2(g.extra)])] as (string | number | Date)[][];
  };

  async function excel() {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const libro = XLSX.utils.book_new();
      const anadir = (nombre: string, filasHoja: (string | number | Date)[][], anchos: number[], filtro = false) => {
        const h = XLSX.utils.aoa_to_sheet(filasHoja, { cellDates: true, dateNF: "dd/mm/yyyy" });
        h["!cols"] = anchos.map((wch) => ({ wch }));
        if (filtro && filasHoja.length > 1) h["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filasHoja.length - 1, c: filasHoja[0].length - 1 } }) };
        XLSX.utils.book_append_sheet(libro, h, nombre);
      };
      // Fecha, Código, Nombre, Total Horas, FINCA, mayores…, Tareas, TOTAL
      anadir("Horas", hojaPrincipal(true), [11, 8, 34, 11, 16, ...cols.map(() => 17), 60, 9], true);
      anadir("Detalle por línea", hojaDetalle(), [11, 8, 34, 16, 24, 20, 44, 8, 11], true);
      anadir("Resumen por trabajador", hojaResumen(), [8, 34, 7, 9, 11]);
      if (tractor.length) anadir("Tractor", hojaTractor(), [11, 16, 8, 40]);
      XLSX.writeFile(libro, nombreArchivo("xlsx"));
    } finally { setExportando(false); }
  }
  function csv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linea = (l: (string | number | Date)[]) => l.map((v) => esc(typeof v === "number" ? String(v).replace(".", ",") : v)).join(";");
    const blob = new Blob(["﻿" + hojaPrincipal(false).map(linea).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombreArchivo("csv"); a.click(); URL.revokeObjectURL(a.href);
  }
  const celda = (v?: number) => (v ? <b>{num(v, 2)}</b> : <span className="text-stone-300">0</span>);
  const cabeza = (cab: string) => { const i = cab.indexOf(" ("); return i < 0 ? cab : <>{cab.slice(0, i)}<small className="block text-[10px] font-semibold text-stone-500">{cab.slice(i + 1)}</small></>; };

  return (
    <div className="mx-auto max-w-[96rem] space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Historial de horas</h1>
        <p className="text-sm text-stone-500">Todas las horas registradas, con los mismos campos que la hoja de AppCampo. Solo consulta: para corregir algo reciente usa «Últimos 7 días». {perfil?.rol === "encargado" ? "Ves lo de tus fincas." : ""}</p>
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
        <span>{cargando ? "Cargando…" : <>{dias.length} filas ({filas.length} registros) · <b>{num(horas, 2)} h</b>{extra > 0 && <> (de ellas {num(extra, 2)} extra)</>}{tractor.length > 0 && <> · 🚜 {num(horasTractor, 2)} h de tractor</>}</>}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={exportando || cargando || (!filas.length && !tractor.length)} onClick={excel}>{exportando ? "Preparando…" : "⬇ Exportar a Excel"}</button>
          <button type="button" className="btn-ghost" disabled={cargando || !filas.length} onClick={csv}>⬇ CSV</button>
        </span>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              {["Fecha", "Código", "Nombre", "Total Horas", "FINCA"].map((h) => <th key={h} className="th">{h}</th>)}
              {cols.map((c) => <th key={c.mayor} className="th">{cabeza(c.cab)}</th>)}
              <th className="th">Tareas</th><th className="th">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {dias.slice(0, MOSTRAR).map((d) => (
              <tr key={`${d.fecha}|${d.codigo}|${d.nombre}|${d.finca}`}>
                <td className="td whitespace-nowrap">{fecha(d.fecha)}</td><td className="td">{d.codigo || "—"}</td><td className="td">{d.nombre}</td>
                <td className="td text-right"><b>{num(d.total, 2)}</b></td><td className="td">{d.finca}</td>
                {cols.map((c) => <td key={c.mayor} className="td text-right">{celda(d.por.get(c.mayor))}</td>)}
                <td className="td min-w-[16rem] text-xs">{d.tareas.join(" | ")}</td>
                <td className="td text-right"><b>{num(sumaCols(d), 2)}</b></td>
              </tr>
            ))}
            {!dias.length && !cargando && <tr><td className="td text-center" colSpan={7 + cols.length}>Sin registros para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      {dias.length > MOSTRAR && <p className="text-xs text-stone-600">Se muestran las {MOSTRAR} filas más recientes de {dias.length}; el Excel lleva todas.</p>}

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
