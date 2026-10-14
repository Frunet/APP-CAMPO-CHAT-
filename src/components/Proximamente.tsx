export default function Proximamente({ titulo, fase, detalle }: { titulo: string; fase: string; detalle: string }) {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h1 className="text-xl font-semibold">{titulo}</h1>
      <div className="card text-sm text-stone-600">
        <p className="font-medium text-stone-800">Previsto para la {fase}</p>
        <p className="mt-1">{detalle}</p>
        <p className="mt-2 text-xs text-stone-400">La estructura de datos y los permisos de esta sección ya están creados en la base de datos.</p>
      </div>
    </div>
  );
}
