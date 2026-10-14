/** Ficha de solo lectura: pares etiqueta / valor. Los valores vacíos se muestran como «—». */
export default function Ficha({ datos }: { datos: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {datos.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-stone-500">{k}</dt>
          <dd className="text-sm">{v === null || v === undefined || v === "" ? "—" : v}</dd>
        </div>
      ))}
    </dl>
  );
}
