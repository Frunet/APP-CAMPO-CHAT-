import Link from "next/link";
import { cargarContexto } from "@/lib/datos";
import { Field } from "@/components/ActionForm";
import ActionForm from "@/components/ActionForm";
import { retirarNovedad } from "@/lib/actions";
import { fecha } from "@/lib/format";

const TIPOS: Record<string, string> = { avance: "Avance", incidencia: "Incidencia", aviso: "Aviso", otro: "Otro" };
const COLOR: Record<string, string> = { avance: "bg-green-100 text-green-800", incidencia: "bg-red-100 text-red-800", aviso: "bg-amber-100 text-amber-800", otro: "bg-stone-100 text-stone-700" };
const MOSTRAR = 300;
const uuid = (s?: string) => (s && /^[0-9a-f-]{36}$/i.test(s) ? s : undefined);
const dia = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

export default async function Diario({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await cargarContexto();
  const finca = uuid(sp.finca), desde = dia(sp.desde), hasta = dia(sp.hasta), texto = (sp.texto ?? "").replace(/[%*,()\\]/g, " ").trim().slice(0, 60);
  let q = ctx.db.from("diario_fincas").select("id,num,fecha,tipo,tema,texto,created_by,fincas(nombre),parcelas(codigo),autor_nombre").eq("activa", true)
    .order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(MOSTRAR + 1);
  if (finca) q = q.eq("finca_id", finca);
  if (desde) q = q.gte("fecha", desde);
  if (hasta) q = q.lte("fecha", hasta);
  if (texto) q = q.or(`texto.ilike.%${texto}%,tema.ilike.%${texto}%`);
  const { data, error } = await q;
  const filas = (data ?? []) as any[];
  const { data: yo } = await ctx.db.auth.getUser();
  const qs = new URLSearchParams(Object.entries({ finca, desde, hasta }).filter(([, v]) => v) as [string, string][]).toString();
  const href = (f: string) => `/api/exportar/diario?formato=${f}${qs ? `&${qs}` : ""}`;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Diario de fincas</h1>
      <p className="text-xs text-stone-500">Avances, incidencias y avisos de cada finca, visibles para todos los usuarios que la tienen asignada. Se anotan desde el <Link href="/chat" className="text-brand-700">chat</Link> («anota que el anillado está terminado en Fortaleza») y se confirman con un botón.</p>

      <form method="get" className="card grid gap-3 sm:grid-cols-5">
        <Field label="Finca"><select name="finca" className="input" defaultValue={finca ?? ""}><option value="">Todas</option>{ctx.fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
        <Field label="Desde"><input type="date" name="desde" className="input" defaultValue={desde ?? ""} /></Field>
        <Field label="Hasta"><input type="date" name="hasta" className="input" defaultValue={hasta ?? ""} /></Field>
        <Field label="Buscar"><input name="texto" className="input" defaultValue={texto} placeholder="anillado" /></Field>
        <div className="flex items-end"><button className="btn w-full">Filtrar</button></div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <a className="btn" href={href("xlsx")}>⬇ Descargar Excel</a><a className="btn-ghost" href={href("pdf")}>⬇ Descargar PDF</a>
        <span className="text-xs text-stone-500">{filas.length > MOSTRAR ? `Se muestran las ${MOSTRAR} más recientes; la descarga incluye todas.` : `${filas.length} anotación(es).`}</span>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">No se pudo cargar el diario: {error.message}</p>}

      <ol className="space-y-2">
        {filas.slice(0, MOSTRAR).map((r) => (
          <li key={r.id} className="card flex flex-col gap-1 !p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
              <span className={`rounded px-1.5 py-0.5 font-medium ${COLOR[r.tipo]}`}>{TIPOS[r.tipo]}</span>
              <b className="text-stone-800">{r.fincas?.nombre}{r.parcelas?.codigo ? ` · ${r.parcelas.codigo}` : ""}</b>
              <span>{fecha(r.fecha)}</span>{r.tema && <span>· {r.tema}</span>}
              <span className="ml-auto">D{r.num}{r.autor_nombre ? ` · ${r.autor_nombre}` : ""}</span>
            </div>
            <p className="text-sm">{r.texto}</p>
            {ctx.puedeRegistrar && (ctx.rol !== "encargado" || r.created_by === yo.user?.id) && (
              <ActionForm action={retirarNovedad} label="Retirar" danger reset={false} className="flex" confirmar="¿Retirar esta anotación? Deja de verse, pero queda en el historial.">
                <input type="hidden" name="id" value={r.id} />
              </ActionForm>
            )}
          </li>
        ))}
        {!filas.length && !error && <li className="card text-sm text-stone-500">No hay anotaciones con este filtro.</li>}
      </ol>
    </div>
  );
}
