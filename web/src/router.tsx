import { useEffect, useState } from "react";

/** Rutas con hash (#/horas): GitHub Pages solo sirve ficheros, así que no puede haber rutas del servidor. */
const leer = () => (location.hash.replace(/^#/, "") || "/").split("?")[0];
export function useRuta() {
  const [ruta, setRuta] = useState(leer());
  useEffect(() => {
    const f = () => setRuta(leer());
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return ruta;
}
export const ir = (to: string) => { location.hash = to; };
export function Navigate({ to }: { to: string }) { useEffect(() => ir(to), [to]); return null; }
export function Link({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  return <a href={`#${to}`} className={className}>{children}</a>;
}
