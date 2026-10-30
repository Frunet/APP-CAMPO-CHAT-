import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient;

// ---------- Resolución de finca / parcela ----------
export type Ref = { finca_id?: string; parcela_id?: string; lote_id?: string; finca?: string; parcela?: string; lote?: string; sup_ha?: number | null };

export async function resolver(db: Db, fincaTxt?: string, parcelaTxt?: string, loteTxt?: string): Promise<Ref | { error: string }> {
  const out: Ref = {};
  if (fincaTxt) {
    const { data } = await db.from("fincas").select("id,codigo,nombre,superficie_ha").eq("activa", true);
    const q = fincaTxt.trim().toLowerCase();
    const m = (data ?? []).filter((f) => f.codigo.toLowerCase() === q || f.nombre.toLowerCase().includes(q));
    if (m.length === 0) return { error: `No existe ninguna finca autorizada que coincida con «${fincaTxt}».` };
    if (m.length > 1) return { error: `«${fincaTxt}» es ambiguo: ${m.map((f) => f.nombre).join(", ")}. Pregunta cuál.` };
    out.finca_id = m[0].id; out.finca = m[0].nombre; out.sup_ha = m[0].superficie_ha;
  }
  if (parcelaTxt) {
    let qb = db.from("parcelas").select("id,codigo,nombre,finca_id,superficie_ha");
    if (out.finca_id) qb = qb.eq("finca_id", out.finca_id);
    const { data } = await qb;
    const q = parcelaTxt.trim().toLowerCase().replace(/^parcela\s*/, "");
    const m = (data ?? []).filter((p) => p.codigo.toLowerCase() === q || (p.nombre ?? "").toLowerCase().includes(q));
    if (m.length === 0) return { error: `No existe la parcela «${parcelaTxt}»${out.finca ? ` en ${out.finca}` : ""}.` };
    if (m.length > 1) return { error: `«${parcelaTxt}» existe en varias fincas; indica la finca.` };
    out.parcela_id = m[0].id; out.parcela = m[0].nombre ?? m[0].codigo; out.finca_id = m[0].finca_id;
    out.sup_ha = m[0].superficie_ha;
  }
  if (loteTxt) {
    if (!out.parcela_id) return { error: "Para indicar un lote hay que indicar también la parcela. Pregunta cuál." };
    const { data } = await db.from("lotes").select("id,codigo,nombre,superficie_ha").eq("parcela_id", out.parcela_id);
    const q = loteTxt.trim().toLowerCase().replace(/^lote\s*/, "");
    const m = (data ?? []).filter((l) => l.codigo.toLowerCase() === q || (l.nombre ?? "").toLowerCase().includes(q));
    if (m.length === 0) return { error: `La parcela ${out.parcela} no tiene ningún lote «${loteTxt}».${(data ?? []).length ? ` Lotes: ${(data ?? []).map((l) => l.codigo).join(", ")}.` : " No tiene lotes."}` };
    if (m.length > 1) return { error: `«${loteTxt}» es ambiguo: ${m.map((l) => l.codigo).join(", ")}. Pregunta cuál.` };
    out.lote_id = m[0].id; out.lote = m[0].codigo;
    if (m[0].superficie_ha != null) out.sup_ha = m[0].superficie_ha;
  }
  return out;
}

/** Equipo/cuadrilla o trabajador concreto (condiciones propias) de la finca; solo uno de los dos. */
export async function resolverPersonal(db: Db, fincaId: string | undefined, equipoTxt?: string, trabajadorTxt?: string): Promise<{ equipo_id?: string; trabajador_id?: string; nombre?: string } | { error: string }> {
  if (equipoTxt && trabajadorTxt) return { error: "Indica un equipo o un trabajador, no ambos en el mismo parte." };
  const buscar = async (tabla: "equipos" | "trabajadores", txt: string) => {
    let qb = db.from(tabla).select("*").eq("activo", true);
    if (fincaId) qb = tabla === "trabajadores" ? qb.or(`finca_id.eq.${fincaId},finca_id.is.null`) : qb.eq("finca_id", fincaId); // un trabajador sin finca vale para todas
    const { data } = await qb;
    const q = txt.trim().toLowerCase();
    const porCodigo = (data ?? []).filter((x: any) => x.codigo && String(x.codigo).toLowerCase() === q);
    const m = porCodigo.length === 1 ? porCodigo : (data ?? []).filter((x: any) => x.nombre.toLowerCase().includes(q));
    if (m.length === 0) return { error: `No hay ${tabla === "equipos" ? "ningún equipo" : "ningún trabajador"} «${txt}» en esa finca. Pregunta o usa solo el número de personas.` };
    if (m.length > 1) return { error: `«${txt}» es ambiguo: ${m.map((x: any) => x.nombre).join(", ")}. Pregunta cuál.` };
    return { id: m[0].id as string, nombre: m[0].nombre as string };
  };
  if (equipoTxt) { const r = await buscar("equipos", equipoTxt); return "error" in r ? r : { equipo_id: r.id, nombre: r.nombre }; }
  if (trabajadorTxt) { const r = await buscar("trabajadores", trabajadorTxt); return "error" in r ? r : { trabajador_id: r.id, nombre: r.nombre }; }
  return {};
}
export const esError = (r: Ref | { error: string }): r is { error: string } => "error" in r;

