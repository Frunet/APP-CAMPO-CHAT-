import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_UID, MSG_DEMO } from "./config";
import { datosDemo, type Tablas } from "./datos";

/**
 * Sustituto en memoria del cliente de Supabase para el modo demo.
 * Soporta solo lo que usa esta app: select con relaciones, filtros, orden, límite, count y single.
 * Cualquier escritura devuelve un error explicativo: en demo no se guarda nada.
 */
type Row = Record<string, any>;
type Nodo = { col: string } | { rel: string; inner: boolean; hijos: Nodo[] };

// nombre de la relación (tabla) -> prefijo de la clave foránea
const SING: Record<string, string> = {
  fincas: "finca", parcelas: "parcela", campanas: "campana", documentos: "documento", lotes: "lote", equipos: "equipo", trabajadores: "trabajador", profiles: "profile",
};

function dividir(s: string): string[] {
  const out: string[] = []; let depth = 0, ini = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "," && depth === 0) { out.push(s.slice(ini, i)); ini = i + 1; }
  }
  out.push(s.slice(ini));
  return out.map((x) => x.trim()).filter(Boolean);
}

function parseSelect(s: string): Nodo[] {
  return dividir(s).map((p): Nodo => {
    const i = p.indexOf("(");
    if (i < 0) return { col: p };
    let nombre = p.slice(0, i).trim();
    const inner = nombre.endsWith("!inner");
    nombre = nombre.replace("!inner", "").split(":").pop()!.trim();
    return { rel: nombre, inner, hijos: parseSelect(p.slice(i + 1, p.lastIndexOf(")"))) };
  });
}

function proyectar(T: Tablas, tabla: string, row: Row, nodos: Nodo[]): Row | null {
  const out: Row = {};
  for (const n of nodos) {
    if ("col" in n) {
      if (n.col === "*") Object.assign(out, row);
      else out[n.col] = row[n.col] ?? null;
      continue;
    }
    const fkUno = `${SING[n.rel]}_id`;
    if (SING[n.rel] && fkUno in row) {
      const hijo = (T[n.rel] ?? []).find((x) => x.id === row[fkUno]);
      const p = hijo ? proyectar(T, n.rel, hijo, n.hijos) : null;
      if (!p && n.inner) return null;
      out[n.rel] = p;
    } else {
      const fk = `${SING[tabla]}_id`;
      const lista = (T[n.rel] ?? []).filter((x) => x[fk] === row.id).map((x) => proyectar(T, n.rel, x, n.hijos)).filter(Boolean);
      if (!lista.length && n.inner) return null;
      out[n.rel] = lista;
    }
  }
  return out;
}

const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);

class Consulta implements PromiseLike<any> {
  private filtros: ((r: Row) => boolean)[] = [];
  private ordenes: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private nodos: Nodo[] = [{ col: "*" }];
  private lim: number | null = null;
  private contar = false;
  private head = false;
  private modo: "lista" | "uno" | "quizas" = "lista";
  private escritura = false;
  constructor(private T: Tablas, private tabla: string) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    this.nodos = parseSelect(cols);
    if (opts?.count) this.contar = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert() { this.escritura = true; return this; }
  update() { this.escritura = true; return this; }
  upsert() { this.escritura = true; return this; }
  delete() { this.escritura = true; return this; }

  eq(c: string, v: any) { this.filtros.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  neq(c: string, v: any) { this.filtros.push((r) => r[c] !== v); return this; }
  gt(c: string, v: any) { this.filtros.push((r) => r[c] != null && r[c] > v); return this; }
  gte(c: string, v: any) { this.filtros.push((r) => r[c] != null && r[c] >= v); return this; }
  lt(c: string, v: any) { this.filtros.push((r) => r[c] != null && r[c] < v); return this; }
  lte(c: string, v: any) { this.filtros.push((r) => r[c] != null && r[c] <= v); return this; }
  in(c: string, vs: any[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: any) { this.filtros.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  ilike(c: string, p: string) { const t = p.replace(/%/g, "").toLowerCase(); this.filtros.push((r) => String(r[c] ?? "").toLowerCase().includes(t)); return this; }
  not(c: string, op: string, v: any) {
    this.filtros.push((r) => (op === "is" ? !(v === null ? r[c] == null : r[c] === v) : op === "eq" ? r[c] !== v : true));
    return this;
  }
  or(expr: string) {
    const conds = dividir(expr).map((x) => {
      const [c, op, ...resto] = x.split(".");
      const v = resto.join(".");
      return (r: Row) => (op === "ilike" ? String(r[c] ?? "").toLowerCase().includes(v.replace(/%/g, "").toLowerCase()) : String(r[c]) === v);
    });
    this.filtros.push((r) => conds.some((f) => f(r)));
    return this;
  }
  order(col: string, o?: { ascending?: boolean; nullsFirst?: boolean }) { this.ordenes.push({ col, asc: o?.ascending ?? true, nullsFirst: o?.nullsFirst }); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.modo = "uno"; return this; }
  maybeSingle() { this.modo = "quizas"; return this; }

  private ejecutar() {
    if (this.escritura) return { data: null, count: null, error: { message: MSG_DEMO, code: "DEMO" } };
    let filas = (this.T[this.tabla] ?? []).filter((r) => this.filtros.every((f) => f(r)));
    for (const o of [...this.ordenes].reverse()) {
      filas = [...filas].sort((a, b) => {
        const x = a[o.col], y = b[o.col];
        if (x == null || y == null) {
          if (x == null && y == null) return 0;
          const nulosPrimero = o.nullsFirst ?? !o.asc; // Postgres: NULLS LAST en ASC, FIRST en DESC
          return (x == null ? -1 : 1) * (nulosPrimero ? 1 : -1);
        }
        return o.asc ? cmp(x, y) : cmp(y, x);
      });
    }
    const total = filas.length;
    if (this.lim != null) filas = filas.slice(0, this.lim);
    const data = filas.map((r) => proyectar(this.T, this.tabla, r, this.nodos)).filter((x): x is Row => !!x);
    const count = this.contar ? total : null;
    if (this.head) return { data: null, count, error: null };
    if (this.modo === "lista") return { data, count, error: null };
    if (data.length === 0)
      return this.modo === "quizas" ? { data: null, count, error: null } : { data: null, count, error: { message: "Sin resultados", code: "PGRST116" } };
    return { data: data[0], count, error: null };
  }

  then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, ko?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.ejecutar()).then(ok, ko);
  }
}

export function crearClienteDemo(): SupabaseClient {
  const T = datosDemo();
  const usuario = { id: DEMO_UID, email: "demo@frunet.net" };
  const sinStorage = async () => ({ data: null, error: { message: MSG_DEMO } });
  const cliente = {
    from: (tabla: string) => new Consulta(T, tabla),
    rpc: async (fn: string) => ({ data: fn === "es_admin" ? true : null, error: null }),
    auth: {
      getUser: async () => ({ data: { user: usuario }, error: null }),
      signInWithPassword: async () => ({ data: { user: usuario }, error: null }),
      signOut: async () => ({ error: null }),
      admin: { createUser: async () => ({ data: null, error: { message: MSG_DEMO } }) },
    },
    storage: { from: () => ({ download: sinStorage, upload: sinStorage, createSignedUrl: sinStorage }) },
  };
  return cliente as unknown as SupabaseClient;
}
