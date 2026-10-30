import { useState } from "react";
import { db } from "../supabase";
import { Field, fondo } from "../ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true); setError(null);
    // Un usuario sin @ («encargado») entra con su dirección interna usuario@campo.local
    const u = email.trim().toLowerCase();
    const { error } = await db.auth.signInWithPassword({ email: u.includes("@") ? u : `${u}@campo.local`, password: clave });
    if (error) setError("Usuario o contraseña incorrectos");
    setOcupado(false);
  }

  return (
    <div className="fr-fondo min-h-screen px-4 pt-[12vh]" style={fondo}>
      <form onSubmit={entrar} className="card mx-auto max-w-sm space-y-3">
        <div className="flex flex-col items-center gap-1 text-center"><img src={`${import.meta.env.BASE_URL}logo.png`} alt="FRUNET" className="h-24 w-24" /><h1 className="fr-marca !text-xl">Control de fincas</h1></div>
        <p className="text-xs text-stone-500">Solo para personal autorizado</p>
        <Field label="Usuario o correo"><input type="text" className="input" autoComplete="username" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Contraseña"><input type="password" className="input" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="btn w-full" disabled={ocupado}>{ocupado ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}
