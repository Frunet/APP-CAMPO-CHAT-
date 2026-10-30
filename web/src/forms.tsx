import { useState } from "react";
import { msgError } from "./ui";

/** Valor de texto de un formulario: recortado, o null si está vacío. */
export const s = (fd: FormData, k: string): string | null => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
/** Número de un formulario (admite coma decimal): null si está vacío, NaN si no es un número. */
export const n = (fd: FormData, k: string): number | null => { const v = s(fd, k); if (v == null) return null; const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : NaN; };
export const check = (error: { message?: string; code?: string } | null) => { if (error) throw new Error(msgError(error)); };
export const opcional = (fd: FormData, k: string, etiqueta: string, max = 1_000_000) => {
  const v = n(fd, k);
  if (Number.isNaN(v) || (v != null && (v < 0 || v > max))) throw new Error(`${etiqueta} no válido`);
  return v;
};
export const uuid = (v: string | null, msg: string) => { if (!v || !/^[0-9a-f-]{36}$/i.test(v)) throw new Error(msg); return v; };

/** Formulario con estado de envío y mensajes de error/éxito. `accion` recibe los datos y devuelve el mensaje de éxito o lanza Error. */
export function AccionForm({ accion, label, reset = true, className = "grid gap-3 sm:grid-cols-2", danger = false, confirmar, onOk, children }: {
  accion: (fd: FormData) => Promise<string>; label: string; reset?: boolean; className?: string; danger?: boolean; confirmar?: string; onOk?: () => void; children: React.ReactNode;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirmar && !window.confirm(confirmar)) return;
    const form = e.currentTarget;
    setOcupado(true); setMsg(null);
    try {
      const ok = await accion(new FormData(form));
      setMsg({ ok });
      if (reset) form.reset();
      onOk?.();
    } catch (err) { setMsg({ error: (err as Error).message }); }
    setOcupado(false);
  }
  return (
    <form onSubmit={enviar} className={className}>
      {children}
      <div className="col-span-full flex flex-wrap items-center gap-3">
        <button className={danger ? "btn-ghost !border-red-300 !text-red-700" : "btn"} disabled={ocupado}>{ocupado ? "Guardando…" : label}</button>
        {msg?.error && <span role="alert" className="text-sm text-red-600">{msg.error}</span>}
        {msg?.ok && <span role="status" className="text-sm text-green-700">{msg.ok}</span>}
      </div>
    </form>
  );
}
