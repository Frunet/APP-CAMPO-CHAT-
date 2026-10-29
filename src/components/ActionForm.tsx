"use client";
import { useActionState, useEffect, useRef } from "react";
import type { Res } from "@/lib/actions";

/** Formulario con estado de envío, mensajes de error/éxito y reinicio opcional tras guardar. */
export default function ActionForm({
  action, label, reset = true, className = "grid gap-3 sm:grid-cols-2", danger = false, confirmar, alTerminar, children,
}: {
  action: (fd: FormData) => Promise<Res>;
  label: string; reset?: boolean; className?: string; danger?: boolean; confirmar?: string; alTerminar?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, fa, pending] = useActionState(async (_: Res, fd: FormData) => action(fd), null);
  const fin = useRef(alTerminar); fin.current = alTerminar;
  useEffect(() => { if (state?.ok && reset) ref.current?.reset(); }, [state, reset]);
  useEffect(() => { if (state?.ok) fin.current?.(); }, [state]);

  return (
    <form
      ref={ref} action={fa} className={className}
      onSubmit={(e) => { if (confirmar && !window.confirm(confirmar)) e.preventDefault(); }}
    >
      {children}
      <div className="col-span-full flex flex-wrap items-center gap-3">
        <button className={danger ? "btn-ghost !border-red-300 !text-red-700" : "btn"} disabled={pending}>
          {pending ? "Guardando…" : label}
        </button>
        {state?.error && <span role="alert" className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span role="status" className="text-sm text-green-700">{state.ok}</span>}
      </div>
    </form>
  );
}

export function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block text-sm ${wide ? "col-span-full" : ""}`}>
      <span className="mb-1 block text-xs font-medium text-stone-600">{label}</span>
      {children}
    </label>
  );
}
