/** Campos compartidos por la introducción y la corrección de horas. */
export default function CajaHoras({ mayor, tarea, children }: { mayor?: string; tarea: string; children: React.ReactNode }) {
  return <label className="block min-w-0">
    {mayor && <span className="hidden truncate text-[10px] font-bold uppercase leading-tight text-brand-700 sm:block">{mayor}</span>}
    <span className="mb-0.5 line-clamp-2 block min-h-[1.9em] text-[11px] font-semibold leading-tight text-stone-700 sm:text-xs">{tarea}</span>
    {children}
  </label>;
}
