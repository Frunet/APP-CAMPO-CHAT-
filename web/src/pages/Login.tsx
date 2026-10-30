import { useState } from "react";
import { db } from "../supabase";
import { Field } from "../ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true); setError(null);
    const { error } = await db.auth.signInWithPassword({ email: email.trim(), password: clave });
    if (error) setError("Correo o contraseña incorrectos");
    setOcupado(false);
  }

  return (
    <div className="mx-auto mt-[15vh] max-w-sm px-4">
      <form onSubmit={entrar} className="card space-y-3">
        <h1 className="text-lg font-semibold text-brand-700">🌱 Control de Fincas</h1>
        <p className="text-xs text-stone-500">Solo para personal autorizado</p>
        <Field label="Correo"><input type="email" className="input" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Contraseña"><input type="password" className="input" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="btn w-full" disabled={ocupado}>{ocupado ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}
