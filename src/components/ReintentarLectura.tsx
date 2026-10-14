"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ReintentarLectura({ id, etiqueta = "Leer documento" }: { id: string; etiqueta?: string }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  async function leer() {
    setCargando(true); setError("");
    const r = await fetch(`/api/documentos/${id}/procesar`, { method: "POST" });
    const j = await r.json();
    setCargando(false);
    if (!r.ok) return setError(j.error ?? "Error");
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn-ghost" onClick={leer} disabled={cargando}>{cargando ? "Leyendo…" : etiqueta}</button>
      {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
