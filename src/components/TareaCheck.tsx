"use client";
import { useTransition } from "react";
import { completarTarea } from "@/lib/actions";

export default function TareaCheck({ id, completada }: { id: string; completada: boolean }) {
  const [pend, start] = useTransition();
  return (
    <input type="checkbox" checked={completada} disabled={pend} aria-label="Completada"
      onChange={(e) => start(async () => { const fd = new FormData(); fd.set("id", id); fd.set("completada", String(e.target.checked)); await completarTarea(fd); })} />
  );
}
