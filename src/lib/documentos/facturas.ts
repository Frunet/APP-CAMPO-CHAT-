import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Facturas leídas con IA: asignación de finca POR LÍNEA con los identificadores de cada finca, tipo (emitida/recibida) según los NIF de
 * nuestras empresas y comprobación de que las líneas suman el total de la factura. Todo en código, sin depender de lo que "crea" la IA.
 */
export const norm = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const nifNorm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export type Ident = { finca_id: string; finca: string; valor_norm: string; etiqueta: string };

/** Identificadores que ve el usuario (RLS): nombre y código de cada finca + los dados de alta en Maestros. */
export async function cargarIdentificadores(db: SupabaseClient): Promise<Ident[]> {
  const [{ data: fs }, { data: ids }] = await Promise.all([
    db.from("fincas").select("id,nombre,codigo").eq("activa", true),
    db.from("finca_identificadores").select("finca_id,tipo,valor,valor_norm"),
  ]);
  const nombre = new Map(((fs ?? []) as any[]).map((f) => [f.id as string, f.nombre as string]));
  const out: Ident[] = [];
  for (const f of (fs ?? []) as any[]) {
    for (const [v, t] of [[f.nombre, "nombre"], [f.codigo, "código"]] as const) { const n = norm(v); if (n) out.push({ finca_id: f.id, finca: f.nombre, valor_norm: n, etiqueta: `${t} «${v}»` }); }
  }
  for (const i of (ids ?? []) as any[]) if (nombre.has(i.finca_id)) out.push({ finca_id: i.finca_id, finca: nombre.get(i.finca_id)!, valor_norm: i.valor_norm, etiqueta: `${i.tipo} «${i.valor}»` });
  return out;
}

/** Busca identificadores dentro de un texto (por palabras completas). Devuelve las fincas distintas que aparecen. */
export function buscarFincas(texto: unknown, idents: Ident[]) {
  const t = norm(texto);
  if (!t) return [] as Ident[];
  const hits = new Map<string, Ident>();
  for (const i of idents) {
    if (!i.valor_norm) continue;
    const ok = i.valor_norm.length < 3 ? t === i.valor_norm : (` ${t} `).includes(` ${i.valor_norm} `);
    if (ok && !hits.has(i.finca_id)) hits.set(i.finca_id, i);
  }
  return [...hits.values()];
}

export type Asignacion = { finca_id: string | null; via: string | null; aviso: string | null };
/** Por línea: primero la referencia propia de la línea, luego su concepto, y por último las referencias de la cabecera. */
export function asignarFinca(r: { finca_ref?: string | null; concepto?: string | null }, cabecera: string[], idents: Ident[]): Asignacion {
  const niveles: [string, unknown][] = [["la referencia de la línea", r.finca_ref], ["el concepto de la línea", r.concepto], ["la cabecera de la factura", cabecera.join(" · ")]];
  for (const [donde, texto] of niveles) {
    const h = buscarFincas(texto, idents);
    if (h.length === 1) return { finca_id: h[0].finca_id, via: `${h[0].finca} (por ${h[0].etiqueta} en ${donde})`, aviso: null };
    if (h.length > 1) return { finca_id: null, via: null, aviso: `Aparecen varias fincas en ${donde} (${h.map((x) => x.finca).join(", ")}): elige la correcta.` };
  }
  const ref = String(r.finca_ref ?? "").trim();
  return { finca_id: null, via: null, aviso: ref ? `«${ref}» no coincide con ninguna finca: elige la finca (y añade el identificador en Maestros para la próxima vez).` : "No se identifica la finca de esta línea: elige la finca." };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Completa los registros de factura: tipo emitida/recibida, finca por línea y comprobación de totales. */
export function procesarFacturas(registros: Record<string, any>[], cabecera: string[], idents: Ident[], propias: { nif: string }[]) {
  const misNif = new Set(propias.map((p) => nifNorm(p.nif)));
  const esFactura = (r: Record<string, any>) => r.numero_factura != null || r.emisor_nif != null || r.cliente_nif != null || r.base != null;
  const grupos = new Map<string, Record<string, any>[]>();

  for (const r of registros) {
    if (r.tipo !== "gasto" && r.tipo !== "venta") continue;
    if (!esFactura(r)) continue;
    r.dudas = Array.isArray(r.dudas) ? r.dudas : [];
    const emisor = nifNorm(r.emisor_nif), cliente = nifNorm(r.cliente_nif);
    if (misNif.size) {
      if (emisor && misNif.has(emisor)) { r.tipo = "venta"; r.proveedor = r.proveedor ?? null; }
      else if (cliente && misNif.has(cliente)) r.tipo = "gasto";
      else r.dudas.push("No reconozco si es una factura emitida o recibida: ningún NIF coincide con tus empresas (Maestros → Empresas propias). Revisa el tipo.");
    }
    // importe de la línea = base sin IVA (la cuenta de resultados trabaja sin IVA)
    if (r.base != null && r.importe == null) r.importe = r.base;
    const a = asignarFinca(r, cabecera, idents);
    r.finca_id = a.finca_id; r.finca_via = a.via;
    if (a.aviso) r.dudas.push(a.aviso);
    const clave = `${nifNorm(r.emisor_nif) || norm(r.proveedor)}|${norm(r.numero_factura)}`;
    if (norm(r.numero_factura)) grupos.set(clave, [...(grupos.get(clave) ?? []), r]);
  }

  // las líneas deben sumar el total de la factura (con su IVA)
  for (const lineas of grupos.values()) {
    const total = lineas.map((l) => num(l.total_factura)).find((x) => x != null);
    if (total == null) continue;
    let suma = 0, completo = true;
    for (const l of lineas) {
      const base = num(l.importe);
      if (base == null) { completo = false; break; }
      const iva = num(l.iva_importe) ?? (num(l.iva_pct) != null ? r2((base * l.iva_pct) / 100) : null);
      if (iva == null) { completo = false; break; }
      if (num(l.iva_importe) == null) l.iva_importe = iva;
      suma += base + iva;
    }
    if (!completo) { lineas.forEach((l) => l.dudas.push("No se puede comprobar que las líneas sumen el total de la factura (falta algún IVA o importe).")); continue; }
    if (Math.abs(suma - total) > 0.02 * lineas.length + 0.02)
      lineas.forEach((l) => l.dudas.push(`Las líneas suman ${r2(suma)} € con IVA y el total de la factura es ${total} €: puede faltar o sobrar alguna línea.`));
  }
  return registros;
}

// ---------- Excel / CSV de facturas: columnas ----------
export const CAMPOS_TABLA = [
  ["fecha", "Fecha", true], ["tercero", "Proveedor / cliente", true], ["nif", "NIF/CIF", false], ["numero", "Nº de factura", true], ["base", "Base imponible", true],
  ["iva", "IVA (importe)", false], ["total", "Total", false], ["concepto", "Concepto", false], ["finca", "Finca", false], ["tipo", "Tipo (emitida/recibida)", false],
] as const;
export type CampoTabla = (typeof CAMPOS_TABLA)[number][0];
export type Mapeo = Partial<Record<CampoTabla, number>>;

const PATRONES: Record<CampoTabla, RegExp> = {
  fecha: /^(fecha|fec|date)( factura| emision| expedicion)?$|^fecha/,
  tercero: /proveedor|cliente|razon social|emisor|acreedor|nombre|tercero/,
  nif: /^(nif|cif|nif cif|cif nif|dni|vat)|nif|cif/,
  numero: /(n|num|numero|nº|no)? ?(de )?(factura|fra|doc)|^factura$|^fra$|n factura|numero/,
  base: /base|neto|subtotal|importe sin iva|sin iva/,
  iva: /^iva$|cuota iva|importe iva|^iva |impuesto/,
  total: /^total|importe total|total factura|con iva/,
  concepto: /concepto|descripcion|detalle|articulo|producto|observ/,
  finca: /finca|parcela|ubicacion|obra|albaran|referencia|suministro/,
  tipo: /^tipo|emitida|recibida|clase/,
};

/** Asigna a cada campo la columna cuyo encabezado mejor lo describe. Lo que no encuentre queda sin asignar (se pregunta al usuario). */
export function detectarColumnas(cabeceras: string[]): Mapeo {
  const hs = cabeceras.map((h) => norm(h));
  const usadas = new Set<number>(), m: Mapeo = {};
  // orden de más específico a menos para que "NIF cliente" no se lleve la columna del cliente
  const orden: CampoTabla[] = ["nif", "numero", "total", "iva", "base", "fecha", "tipo", "finca", "concepto", "tercero"];
  for (const c of orden) {
    const i = hs.findIndex((h, k) => h && !usadas.has(k) && PATRONES[c].test(h));
    if (i >= 0) { m[c] = i; usadas.add(i); }
  }
  return m;
}
export const faltan = (m: Mapeo) => CAMPOS_TABLA.filter(([k, , oblig]) => oblig && m[k] == null).map(([k, t]) => ({ k, t }));

const numES = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/[€\s]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};
const fechaISO = (v: unknown): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
};

/** Cada fila → una línea de factura. Si el nº de factura se repite en varias filas, son líneas de la misma factura. */
export function registrosDeTabla(filas: unknown[][], m: Mapeo, tipoDefecto: "gasto" | "venta" | null, idents: Ident[], propias: { nif: string }[]) {
  const celda = (f: unknown[], k: CampoTabla) => (m[k] == null ? null : f[m[k]!]);
  const regs: Record<string, any>[] = [];
  const misNif = new Set(propias.map((p) => nifNorm(p.nif)));
  filas.forEach((f, n) => {
    if (!f || f.every((c) => c == null || String(c).trim() === "")) return;
    const dudas: string[] = [];
    const fecha = fechaISO(celda(f, "fecha")); if (!fecha) dudas.push("Fecha ilegible o vacía.");
    const base = numES(celda(f, "base")); if (base == null) dudas.push("Base imponible ilegible o vacía.");
    const iva = numES(celda(f, "iva")), total = numES(celda(f, "total"));
    const t = norm(celda(f, "tipo"));
    const tipo: "gasto" | "venta" | null = /emit|venta|cobr/.test(t) ? "venta" : /recib|compra|gasto|pag/.test(t) ? "gasto" : tipoDefecto;
    if (!tipo) dudas.push("Falta saber si es una factura emitida (venta) o recibida (gasto).");
    const nifT = String(celda(f, "nif") ?? "").trim() || null;
    if (nifT && misNif.has(nifNorm(nifT))) dudas.push("El NIF indicado es de una de tus empresas: comprueba que no sea el del proveedor/cliente.");
    const r: Record<string, any> = {
      tipo: tipo ?? "gasto", fecha, proveedor: String(celda(f, "tercero") ?? "").trim() || null, tercero_nif: nifT, numero_factura: String(celda(f, "numero") ?? "").trim() || null,
      importe: base, iva_importe: iva, total_factura: null, concepto: String(celda(f, "concepto") ?? "").trim() || null, finca_ref: String(celda(f, "finca") ?? "").trim() || null,
      moneda: "EUR", categoria: "otros", dudas, fila_origen: n + 2,
    };
    if (!r.numero_factura) dudas.push("Falta el número de factura.");
    const a = asignarFinca(r, [], idents);
    r.finca_id = a.finca_id; r.finca_via = a.via; if (a.aviso) dudas.push(a.aviso);
    if (total != null && base != null && iva != null && Math.abs(base + iva - total) > 0.02) dudas.push(`Base + IVA (${r2(base + iva)}) no coincide con el total (${total}).`);
    regs.push(r);
  });
  return regs;
}
