"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { DEMO } from "@/lib/demo/config";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => { if (DEMO) router.replace("/"); }, [router]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true); setError("");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) return setError("Correo o contraseña incorrectos.");
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={entrar} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-brand-700">Control de Fincas</h1>
          <p className="text-sm text-stone-500">Accede con tu cuenta</p>
        </div>
        <input className="input" type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <input className="input" type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn w-full" disabled={cargando}>{cargando ? "Entrando…" : "Entrar"}</button>
      </form>
    </main>
  );
}
