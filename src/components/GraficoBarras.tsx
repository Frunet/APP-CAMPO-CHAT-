/** Gráfico de barras en SVG (sin dependencias); cada barra lleva su valor en el tooltip. */
export default function GraficoBarras({
  datos, unidad = "kg", alto = 160, titulo,
}: { datos: { x: string; y: number }[]; unidad?: string; alto?: number; titulo: string }) {
  if (!datos.length) return <p className="text-sm text-stone-500">Sin datos en el periodo.</p>;
  const max = Math.max(...datos.map((d) => d.y), 1);
  const W = 640, padL = 44, padB = 22, padT = 8;
  const bw = (W - padL) / datos.length;
  const h = alto - padB - padT;
  const f = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 0 });
  const paso = Math.ceil(datos.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${alto}`} role="img" aria-label={titulo} className="w-full">
      <title>{titulo}</title>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={padT + h * (1 - t)} y2={padT + h * (1 - t)} stroke="#e7e5e4" />
          <text x={padL - 4} y={padT + h * (1 - t) + 3} textAnchor="end" fontSize="9" fill="#78716c">{f(max * t)}</text>
        </g>
      ))}
      {datos.map((d, i) => {
        const bh = (d.y / max) * h;
        return (
          <g key={d.x}>
            <rect x={padL + i * bw + bw * 0.15} y={padT + h - bh} width={bw * 0.7} height={bh} rx="2" fill="#3f9a4b">
              <title>{`${d.x}: ${f(d.y)} ${unidad}`}</title>
            </rect>
            {i % paso === 0 && (
              <text x={padL + i * bw + bw / 2} y={alto - 6} textAnchor="middle" fontSize="9" fill="#78716c">
                {d.x.slice(5).split("-").reverse().join("/")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
