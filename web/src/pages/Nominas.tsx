import { useState } from "react";
import { Navigate } from "../router";
import { useAuth } from "../auth";
import { db } from "../supabase";
import { Field, useCarga } from "../ui";
import { leerPeriodo, type Camp } from "../lib/periodo";
import { datosNominas } from "../lib/nominas";
import { fecha, iso, num } from "../lib/format";

/** Consulta de las horas de cada trabajador por periodo, a partir de los partes de horas registrados (sin costes). */
export default function Nominas() {
  const { puedeGestionar, cargando: cargandoAuth } = useAuth();
  const hoy = iso(new Date());
  const [f, setF] = useState<Record<string, string>>({ tipo: "mes", mes: hoy.slice(0, 7), anio: hoy.slice(0, 4), trim: String(Math.floor((Number(hoy.slice(5, 7)) - 1) / 3) + 1), desde: hoy.slice(0, 4) + "-01-01", hasta: hoy, campana: "", trabajador: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const { datos, error, cargando } = useCarga(async () => {
    const { data: camps } = await db.from("campanas").select("id,nombre,fecha_inicio,fecha_fin").order("fecha_inicio", { ascending: false });
    const { tipo, p } = leerPeriodo(f, (camps ?? []) as Camp[], hoy);
    return { camps: (camps ?? []) as Camp[], tipo, p, todos: await datosNominas(p.desde, p.hasta) };
  }, [f.tipo, f.mes, f.anio, f.trim, f.desde, f.hasta, f.campana]);

  if (cargandoAuth) return null;
  if (!puedeGestionar) return <Navigate to="/horas" />;
  const todos = datos?.todos ?? [];
  const trabajador = todos.some((g) => g.clave === f.trabajador) ? f.trabajador : "";
  const res = trabajador ? todos.filter((g) => g.clave === trabajador) : todos;
  const suma = (k: "horas" | "extra" | "festivo") => res.reduce((a, g) => a + g[k], 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Nóminas</h1>
      <p className="text-xs text-stone-500">Consulta de las horas de cada trabajador por periodo, a partir de los partes de horas registrados. Las horas de tractor no se incluyen: no son del personal.</p>

      <div className="card grid gap-3 sm:grid-cols-4">
        <Field label="Periodo"><select className="input" value={f.tipo} onChange={set("tipo")}><option value="mes">Mes</option><option value="trimestre">Trimestre</option><option value="anio">Año</option><option value="campana">Campaña</option><option value="rango">Rango de fechas</option></select></Field>
        <Field label="Mes (si «Mes»)"><input type="month" className="input" value={f.mes} onChange={set("mes")} /></Field>
        <Field label="Año / trimestre"><div className="flex gap-2"><input inputMode="numeric" className="input" value={f.anio} onChange={set("anio")} /><select className="input" value={f.trim} onChange={set("trim")}>{[1, 2, 3, 4].map((q) => <option key={q} value={q}>{q}.º</option>)}</select></div></Field>
        <Field label="Trabajador"><select className="input" value={trabajador} onChange={set("trabajador")}><option value="">Todos</option>{todos.map((g) => <option key={g.clave} value={g.clave}>{g.trabajador}</option>)}</select></Field>
        <Field label="Campaña (si «Campaña»)"><select className="input" value={f.campana} onChange={set("campana")}><option value="">—</option>{(datos?.camps ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
        <Field label="Desde (si «Rango»)"><input type="date" className="input" value={f.desde} onChange={set("desde")} /></Field>
        <Field label="Hasta"><input type="date" className="input" value={f.hasta} onChange={set("hasta")} /></Field>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {datos && (
        <p className="text-sm text-stone-600">
          {datos.p.etiqueta} ({fecha(datos.p.desde)} – {fecha(datos.p.hasta)}) · {res.length} trabajador(es) · <b>{num(suma("horas"), 1)} h</b>
          {suma("extra") > 0 && <> (de ellas {num(suma("extra"), 1)} extra)</>}{suma("festivo") > 0 && <> · {num(suma("festivo"), 1)} en festivo</>}
        </p>
      )}
      {cargando && <p className="text-sm text-stone-500">Cargando…</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th colSpan={6} className="th"><div className="grid grid-cols-[1fr_repeat(5,4.5rem)] gap-x-2">{["Trabajador", "Días", "Normales", "Extra", "Festivo", "Total h"].map((h, i) => <span key={h} className={i ? "text-right" : "text-left"}>{h}</span>)}</div></th></tr></thead>
          <tbody className="divide-y divide-stone-100">
            {res.map((g) => (
              <tr key={g.clave}>
                <td className="td" colSpan={6}>
                  <details>
                    <summary className="grid cursor-pointer grid-cols-[1fr_repeat(5,4.5rem)] items-center gap-x-2 text-sm">
                      <span className="font-medium">{g.trabajador}</span>
                      <span className="text-right">{g.dias}</span><span className="text-right">{num(g.normales, 1)}</span><span className="text-right">{num(g.extra, 1)}</span>
                      <span className="text-right">{num(g.festivo, 1)}</span><span className="text-right font-medium">{num(g.horas, 1)}</span>
                    </summary>
                    <table className="mt-2 w-full text-xs"><thead><tr>{["Fecha", "Finca", "Tarea", "Horas", "Extra"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                      <tbody>{g.lineas.map((l, i) => <tr key={i}><td className="td">{fecha(l.fecha)}{l.festivo ? " (festivo)" : ""}</td><td className="td">{l.finca}</td><td className="td">{l.actividad}</td><td className="td">{num(l.horas, 1)}</td><td className="td">{l.extra ? num(l.extra, 1) : ""}</td></tr>)}</tbody></table>
                  </details>
                </td>
              </tr>
            ))}
            {!res.length && !cargando && <tr><td className="td text-stone-500" colSpan={6}>No hay horas en este periodo.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
