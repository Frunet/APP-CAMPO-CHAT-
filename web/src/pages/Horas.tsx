import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";
import { db } from "../supabase";
import { useCarga } from "../ui";
import { CAMPOS_HORAS, MAX_HORAS_DIA } from "../lib/horas";
import { registrarHoras } from "../lib/registrarHoras";
import { iso } from "../lib/format";
import { activoEnFinca, fincasActivas, type AsignacionFinca } from "../lib/personal-fincas";
import Caja from "../components/CajaHoras";
import RepetirDia from "../components/RepetirDia";

type Trab = { id: string; codigo: string | null; nombre: string; activo: boolean; trabajadores_fincas: AsignacionFinca[] };
type Variedad = { id: string; cultivo: string; variedad: string | null };
const dec = (v: string) => { const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const vacias = () => CAMPOS_HORAS.map(() => "");
const es = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 2 });

/**
 * En móvil: finca y fecha, trabajadores amplios y después las horas; la página puede desplazarse.
 * En ordenador: lista a la izquierda y campos a la derecha, con desplazamiento independiente.
 */
function FormHoras({ trabajadores, variedades, alGuardar }: { trabajadores: Trab[]; variedades: Variedad[]; alGuardar: () => void }) {
  const { fincas } = useAuth();
  const hoy = iso(new Date());
  const [finca, setFinca] = useState("");
  const [fechaD, setFecha] = useState(hoy);
  const [buscar, setBuscar] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [horas, setHoras] = useState<string[]>(vacias());
  const [extra, setExtra] = useState("");

  const [tractor, setTractor] = useState("");
  const [kg, setKg] = useState("");
  const [variedad, setVariedad] = useState("");
  const [actividad, setActividad] = useState("");
  const [forzar, setForzar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [repetir, setRepetir] = useState(false);
  useEffect(() => {
    if (!msg?.ok) return;
    const t = setTimeout(() => setMsg(null), 7000);
    return () => clearTimeout(t);
  }, [msg]);
  const fincaEf = finca || (fincas.length === 1 ? fincas[0].id : "");
  useEffect(() => {
    const permitidos = new Set(trabajadores.filter((t) => fincaEf ? activoEnFinca(t, fincaEf) : fincasActivas(t).length > 0).map((t) => t.id));
    setSel((actual) => actual.every((id) => permitidos.has(id)) ? actual : actual.filter((id) => permitidos.has(id)));
  }, [fincaEf, trabajadores]);
  const total = horas.reduce((a, h) => a + dec(h), 0);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return trabajadores.filter((t) => (fincaEf ? activoEnFinca(t, fincaEf) : fincasActivas(t).length > 0) && (!q || `${t.codigo ?? ""} ${t.nombre}`.toLowerCase().includes(q)));
  }, [trabajadores, fincaEf, buscar]);
  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const iCosecha = CAMPOS_HORAS.findIndex((c) => c.cosecha);
  const pedirForzar = !!msg?.error?.includes("igualmente"); // el servidor avisa de que alguien pasaría de 12 h con lo ya registrado
  const nombresSel = trabajadores.filter((t) => sel.includes(t.id)).map((t) => t.nombre);

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setOcupado(true); setMsg(null);
    try {
      const ok = await registrarHoras({ finca_id: fincaEf, fecha: fechaD, trabajadores: sel, horas, extra, tractor, kg, variedad, actividad, forzar });
      setMsg({ ok });
      setSel([]); setHoras(vacias()); setExtra(""); setTractor(""); setKg(""); setVariedad(""); setActividad(""); setForzar(false);
      alGuardar();
    } catch (e) { setMsg({ error: (e as Error).message }); }
    setOcupado(false);
  }

  return (
    <><form onSubmit={enviar} className="fr-horas">
      <section aria-label="Finca y fecha" className="fr-horas-contexto grid grid-cols-2 gap-2">
          <Caja tarea="Finca *"><select className="input input-sm" required value={fincaEf} onChange={(e) => setFinca(e.target.value)}><option value="">Elige…</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Caja>
          <Caja tarea="Fecha *"><input type="date" className="input input-sm" required value={fechaD} max={hoy} onChange={(e) => setFecha(e.target.value)} /></Caja>
      </section>
      <section className="fr-horas-campos space-y-2">
        <button type="button" className="btn-ghost !py-1" disabled={!fincaEf || !fechaD || ocupado} onClick={() => setRepetir(true)}>Repetir el día anterior</button>

        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {CAMPOS_HORAS.map((c, i) => (
            <Caja key={c.etiqueta} mayor={c.mayor} tarea={c.subtipo ? `${c.tarea} · ${c.subtipo}` : c.tarea}>
              <input inputMode="decimal" className={`input input-sm ${horas[i] ? "fr-lleno" : ""}`} placeholder="0" value={horas[i]} onChange={(e) => setHoras((h) => h.map((x, j) => (j === i ? e.target.value : x)))} />
            </Caja>
          ))}
        </div>

        {iCosecha >= 0 && dec(horas[iCosecha]) > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <Caja tarea="Kg cosechados *"><input inputMode="decimal" className="input input-sm" required value={kg} onChange={(e) => setKg(e.target.value)} /></Caja>
            <Caja tarea="Variedad *"><select className="input input-sm" required value={variedad} onChange={(e) => setVariedad(e.target.value)}><option value="">Elige…</option>{variedades.map((v) => <option key={v.id} value={v.id}>{v.cultivo}{v.variedad ? ` · ${v.variedad}` : ""}</option>)}</select></Caja>
          </div>
        )}

        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <Caja tarea="🚜 Tractor día (h)"><input inputMode="decimal" className={`input input-sm ${tractor ? "fr-lleno" : ""}`} placeholder="0" value={tractor} onChange={(e) => setTractor(e.target.value)} /></Caja>
          <Caja tarea="De ellas, extras manuales (h)"><input inputMode="decimal" className={`input input-sm ${extra ? "fr-lleno" : ""}`} placeholder="0" value={extra} onChange={e=>setExtra(e.target.value)} /><p className="mt-1 text-[10px] text-stone-600">Por persona, incluidas en el total; por ejemplo, 7 h extras en un festivo. Se mantiene el mínimo automático al superar 7 h/día, sin duplicarlas.</p></Caja>
          <div><Caja tarea="Observaciones"><input className="input input-sm" placeholder="Escriba aquí…" maxLength={400} value={actividad} onChange={(e) => setActividad(e.target.value)} /></Caja></div>
        </div>

        {(total > MAX_HORAS_DIA || pedirForzar) && (
          <p className={`text-xs ${total > MAX_HORAS_DIA ? "font-bold text-amber-700" : "text-stone-600"}`}>
            {total > MAX_HORAS_DIA && <>⚠ Pasa de {MAX_HORAS_DIA} h en un día. </>}
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} /> Registrar igualmente (más de {MAX_HORAS_DIA} h)</label>
          </p>
        )}
      </section>

      {/* En móvil la lista se muestra antes de las horas para que no quede comprimida al fondo. */}
      <section className="fr-horas-lista">
        <p className="mb-1.5 text-sm font-extrabold uppercase tracking-wide">Empleados <span className="font-semibold normal-case text-stone-600">({sel.length} marcado{sel.length === 1 ? "" : "s"})</span></p>
        <input className="input input-sm mb-2" placeholder="Buscar por código o nombre…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <div className="fr-horas-scroll">
          {visibles.map((t) => (
            <label key={t.id} className={`flex min-h-14 cursor-pointer items-center gap-3 border-b border-stone-100 px-3 py-3 text-base last:border-0 lg:min-h-0 lg:py-2.5 lg:text-sm ${sel.includes(t.id) ? "bg-green-100 font-bold" : ""}`}>
              <input type="checkbox" checked={sel.includes(t.id)} onChange={() => alternar(t.id)} className="h-6 w-6 shrink-0 lg:h-5 lg:w-5" />
              <span className="min-w-0">{t.codigo && <span className="mr-1.5 font-mono text-xs text-stone-500">{t.codigo}</span>}{t.nombre}</span>
            </label>
          ))}
          {!visibles.length && <p className="p-3 text-sm text-stone-500">No hay trabajadores{buscar ? " con ese texto" : ""}.</p>}
        </div>
      </section>

      {/* Barra fija: botón y resumen */}
      <div className="fr-horas-barra">
        <button className="btn" disabled={ocupado}>{ocupado ? "Guardando…" : "Añadir"}</button>
        <span className={`min-w-0 text-sm font-bold ${total > MAX_HORAS_DIA ? "text-amber-700" : "text-stone-700"}`}>
          {sel.length} marcado{sel.length === 1 ? "" : "s"} · {es(total)} h cada uno · extras automáticas
          {sel.length > 0 && total > 0 && <> · total {es(total * sel.length)} h</>}
          {nombresSel.length > 0 && <span className="block truncate text-xs font-semibold text-stone-600">{nombresSel.join(", ")}</span>}
        </span>
      </div>

      {/* Aviso grande arriba: se ve estés donde estés. El de «guardado» se retira solo; el error se queda hasta cerrarlo */}
      {msg && (
        <div role={msg.error ? "alert" : "status"} className={`fixed inset-x-3 top-3 z-50 mx-auto max-w-xl rounded-xl px-4 py-3 text-sm font-bold shadow-xl ${msg.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`} style={{ border: `2px solid ${msg.error ? "#dc2626" : "#118a11"}` }}>
          <div className="flex items-start gap-3">
            <span className="flex-1">{msg.error ? "⚠ " : "✓ "}{msg.error ?? msg.ok}</span>
            <button type="button" aria-label="Cerrar aviso" className="text-lg leading-none" onClick={() => setMsg(null)}>✕</button>
          </div>
        </div>
      )}
    </form>{repetir && fincas.some((f) => f.id === fincaEf) && <RepetirDia finca={fincas.find((f) => f.id === fincaEf)!} destino={fechaD} trabajadores={trabajadores} cerrar={() => setRepetir(false)} alGuardar={alGuardar} />}</>
  );
}

/** Registro de horas: solo el formulario. Para revisar, corregir o eliminar lo registrado está «Últimos 7 días»; para consultar y exportar, «Historial». */
export default function Horas() {
  const { puedeRegistrar } = useAuth();
  const maestros = useCarga(async () => {
    const [t, v] = await Promise.all([
      db.from("trabajadores").select("id,codigo,nombre,activo,trabajadores_fincas(finca_id,activo)").eq("activo", true).order("nombre"),
      db.from("cultivos_maestro").select("id,cultivo,variedad").eq("activo", true).order("cultivo").order("variedad"),
    ]);
    if (t.error) throw new Error(t.error.message);
    if (v.error) throw new Error(v.error.message);
    return { trab: (t.data ?? []) as Trab[], vars: (v.data ?? []) as Variedad[] };
  }, []);

  return (
    <div className="fr-horas-pagina mx-auto max-w-6xl">
      {maestros.error && <p role="alert" className="mb-3 text-sm text-red-600">No se ha podido cargar el personal: {maestros.error}</p>}
      {puedeRegistrar ? (
        <section className="card fr-horas-card"><FormHoras trabajadores={maestros.datos?.trab ?? []} variedades={maestros.datos?.vars ?? []} alGuardar={() => {}} /></section>
      ) : <p className="text-sm text-stone-600">Tu rol solo permite consultar las horas: míralas en «Últimos 7 días».</p>}
    </div>
  );
}
