import type { SupabaseClient } from "@supabase/supabase-js";
import type { TablaExport } from "./informes-export";

/**
 * Nóminas: horas y coste por trabajador y periodo, calculados al momento a partir de los partes de trabajo (una línea por trabajador).
 * No guarda nada. Los partes de un equipo o sin nombres salen agrupados bajo el nombre del equipo o «Sin nombre».
 */
const r2 = (n: number) => Math.round(n * 100) / 100;
const dmy = (s: string) => s.split("-").reverse().join("/");

export type LineaNomina = {
  fecha: string; finca: string; trabajador: string; clave: string; personas: number; horas: number; extra: number; festivo: boolean; coste: number | null; actividad: string; enMaestros: boolean;
};
export type ResumenNomina = {
  clave: string; trabajador: string; enMaestros: boolean; dias: number; normales: number; extra: number; festivo: number; horas: number; coste: number; sinTarifa: number; lineas: LineaNomina[];
};

async function todas(q: (a: number, b: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>) {
  const out: any[] = [];
  for (let a = 0; a < 200000; a += 1000) {
    const { data, error } = await q(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export async function datosNominas(db: SupabaseClient, fincas: string[], desde: string, hasta: string): Promise<ResumenNomina[]> {
  if (!fincas.length) return [];
  const filas = await todas((a, b) =>
    db.from("partes_trabajo")
      .select("id,fecha,num_trabajadores,horas_por_trabajador,horas_totales,horas_extra_totales,festivo,coste_total,actividad,tipo_trabajo,trabajador_id,trabajador_nombre,fincas(nombre),trabajadores(nombre),equipos(nombre)")
      .in("finca_id", fincas).gte("fecha", desde).lte("fecha", hasta).order("fecha").order("id").range(a, b));
  const mapa = new Map<string, ResumenNomina>();
  for (const r of filas) {
    const enMaestros = !!r.trabajador_id;
    const nombre = r.trabajadores?.nombre ?? r.trabajador_nombre ?? (r.equipos?.nombre ? `Equipo ${r.equipos.nombre}` : `Sin nombre (${r.num_trabajadores} persona${r.num_trabajadores > 1 ? "s" : ""})`);
    const clave = r.trabajador_id ?? (r.trabajador_nombre ? `n:${String(r.trabajador_nombre).trim().toLowerCase()}` : r.equipos?.nombre ? `e:${r.equipos.nombre}` : "sin");
    const horas = Number(r.horas_totales ?? 0), extra = Number(r.horas_extra_totales ?? 0);
    const l: LineaNomina = { fecha: r.fecha, finca: r.fincas?.nombre ?? "", trabajador: nombre, clave, personas: r.num_trabajadores, horas, extra, festivo: !!r.festivo, coste: r.coste_total == null ? null : Number(r.coste_total), actividad: [r.tipo_trabajo, r.actividad].filter(Boolean).join(" · "), enMaestros };
    const g: ResumenNomina = mapa.get(clave) ?? { clave, trabajador: nombre, enMaestros, dias: 0, normales: 0, extra: 0, festivo: 0, horas: 0, coste: 0, sinTarifa: 0, lineas: [] };
    g.lineas.push(l); g.horas = r2(g.horas + horas);
    if (l.festivo) g.festivo = r2(g.festivo + horas); else { g.extra = r2(g.extra + extra); g.normales = r2(g.normales + (horas - extra)); }
    if (l.coste == null) g.sinTarifa++; else g.coste = r2(g.coste + l.coste);
    mapa.set(clave, g);
  }
  const lista = [...mapa.values()];
  for (const g of lista) g.dias = new Set(g.lineas.map((l) => l.fecha)).size;
  return lista.sort((a, b) => a.trabajador.localeCompare(b.trabajador, "es"));
}

export function tablasNominas(res: ResumenNomina[]): TablaExport[] {
  return [
    {
      titulo: "Resumen por trabajador", columnas: ["Trabajador", "En Maestros", "Días", "Horas normales", "Horas extra", "Horas festivo", "Horas totales", "Coste (€)", "Líneas sin tarifa"],
      filas: [...res.map((g) => [g.trabajador, g.enMaestros ? "Sí" : "No", g.dias, g.normales, g.extra, g.festivo, g.horas, g.coste, g.sinTarifa]),
        ["TOTAL", "", "", r2(res.reduce((a, g) => a + g.normales, 0)), r2(res.reduce((a, g) => a + g.extra, 0)), r2(res.reduce((a, g) => a + g.festivo, 0)), r2(res.reduce((a, g) => a + g.horas, 0)), r2(res.reduce((a, g) => a + g.coste, 0)), res.reduce((a, g) => a + g.sinTarifa, 0)]],
    },
    {
      titulo: "Detalle por día", columnas: ["Trabajador", "Fecha", "Finca", "Actividad", "Horas", "Horas extra", "Festivo", "Coste (€)"],
      filas: res.flatMap((g) => g.lineas.map((l) => [g.trabajador, dmy(l.fecha), l.finca, l.actividad, l.horas, l.extra, l.festivo ? "Sí" : "No", l.coste == null ? "sin tarifa" : l.coste])),
    },
  ];
}
