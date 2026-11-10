import { db } from "../supabase";
import { CONSULTA_PARTES_OPERATIVA, type ParteOperativo } from "./operativa";
export async function partesPeriodo(desde: string, hasta: string, finca?: string): Promise<ParteOperativo[]> {
  const out: ParteOperativo[] = [];
  for (let a = 0; a < 100000; a += 1000) {
    let q = db.from("partes_trabajo").select(CONSULTA_PARTES_OPERATIVA).gte("fecha", desde).lte("fecha", hasta).order("id").range(a, a + 999);
    if (finca) q = q.eq("finca_id", finca);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data ?? []) as unknown as ParteOperativo[]);
    if ((data ?? []).length < 1000) return out;
  }
  throw new Error("El periodo contiene demasiados registros. Elige un rango más corto.");
}
