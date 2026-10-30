import { useEffect, useState } from "react";

export function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block text-sm ${wide ? "col-span-full" : ""}`}>
      <span className="mb-1 block text-xs font-medium text-stone-600">{label}</span>
      {children}
    </label>
  );
}

/** Carga datos asíncronos; se vuelve a cargar cuando cambia alguna dependencia o se llama a recargar(). */
export function useCarga<T>(fn: () => Promise<T>, deps: unknown[]): { datos: T | null; error: string | null; cargando: boolean; recargar: () => void } {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    fn().then((d) => { if (vivo) { setDatos(d); setError(null); } }).catch((e) => { if (vivo) setError(e?.message ?? String(e)); }).finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { datos, error, cargando, recargar: () => setN((x) => x + 1) };
}

/** Mensaje legible de un error de Supabase/Postgres. */
export function msgError(e: { message?: string; code?: string } | null | undefined): string {
  if (!e) return "";
  if (e.code === "23505") return "ya existe un registro igual";
  if (e.code === "23514") return e.message ?? "valor fuera de rango";
  if (e.code === "42501" || /row-level security/i.test(e.message ?? "")) return "no tienes permiso para esta operación";
  return e.message ?? "error desconocido";
}
