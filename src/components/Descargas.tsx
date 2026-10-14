import Link from "next/link";

/** Botones de descarga (Excel y PDF) con los mismos filtros que la pantalla, y aviso de que el registro se hace desde el chat. */
export default function Descargas({ modulo, qs, n, mostrados, registroPor }: { modulo: string; qs: string; n: number; mostrados: number; registroPor: string }) {
  const href = (f: string) => `/api/exportar/${modulo}?formato=${f}${qs ? `&${qs}` : ""}`;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <a className="btn" href={href("xlsx")}>⬇ Descargar Excel</a>
        <a className="btn-ghost" href={href("pdf")}>⬇ Descargar PDF</a>
        <span className="text-xs text-stone-500">
          {n === 0 ? "Sin registros con este filtro." : mostrados < n ? `Se muestran ${mostrados} de ${n}; la descarga incluye todos.` : `${n} registro(s); la descarga incluye los mismos filtros.`}
        </span>
      </div>
      <p className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
        Pantalla de consulta. {registroPor} <Link href="/chat" className="text-brand-700">Ir al chat →</Link>
      </p>
    </>
  );
}
