"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import RevisionDocumento from "./RevisionDocumento";

type Accion = { id: string; resumen: string; tipo?: string; estado: "pendiente" | "confirmada" | "cancelada" | "caducada"; error?: string };
/** Enlaces de descarga del asistente: [texto](/api/...) → enlace pulsable (solo rutas internas de la propia app). */
function conEnlaces(t: string) {
  const partes: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\/api\/[^)\s]+)\)/g;
  let i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m.index > i) partes.push(t.slice(i, m.index));
    partes.push(<a key={m.index} href={m[2]} className="font-medium text-brand-700 underline">⬇ {m[1]}</a>);
    i = m.index + m[0].length;
  }
  if (i < t.length) partes.push(t.slice(i));
  return partes;
}

type Msg = { id: string; rol: "user" | "assistant"; texto: string; acciones?: Accion[]; enlace?: string; documentos?: string[] };
type Conv = { id: string; titulo: string | null; updated_at: string };

export default function ChatClient() {
  const db = useRef(createClient()).current;
  const [convs, setConvs] = useState<Conv[]>([]);
  const [convId, setConvId] = useState<string | undefined>();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState("");
  const [historial, setHistorial] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  // Voz: leer respuestas, enviar al terminar de dictar, y modo manos libres (escuchar → responder → leer → escuchar)
  const [leer, setLeer] = useState(false);
  const [auto, setAuto] = useState(false);
  const [manos, setManos] = useState(false);
  const refs = useRef({ leer: false, auto: false, manos: false, convId: undefined as string | undefined, enviando: false, dictar: () => {}, enviar: (_: string) => {} });
  refs.current.leer = leer; refs.current.auto = auto; refs.current.manos = manos; refs.current.convId = convId; refs.current.enviando = enviando;
  useEffect(() => {
    try { setLeer(localStorage.getItem("chat_leer") === "1"); setAuto(localStorage.getItem("chat_auto") === "1"); } catch { /* sin almacenamiento */ }
    return () => { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); };
  }, []);
  const guarda = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* ignorar */ } };

  // La conversación abierta y lo que se está escribiendo sobreviven a cambiar de módulo o recargar (por usuario)
  const uid = useRef<string>("");
  const claveConv = () => `chat_conv_${uid.current}`;
  const claveBorr = () => `chat_borrador_${uid.current}`;
  const clavePend = () => `chat_pendiente_${uid.current}`;
  function guardarLS(k: string, v: string | null) { try { if (v == null || v === "") localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }
  function leerLS(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
  const [esperando, setEsperando] = useState<string | null>(null); // mensaje enviado al salir, cuya respuesta aún no se ha guardado

  const cargarConvs = useCallback(async () => {
    const { data } = await db.from("chat_conversaciones").select("id,titulo,updated_at").order("updated_at", { ascending: false }).limit(50);
    setConvs(data ?? []);
  }, [db]);
  useEffect(() => { cargarConvs(); }, [cargarConvs]);

  // Al entrar: reabrir la última conversación y recuperar el borrador (y el mensaje que se estaba enviando al salir)
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await db.auth.getSession();
      uid.current = data.session?.user.id ?? "anon";
      const borr = leerLS(claveBorr()), pend = leerLS(clavePend()), id = leerLS(claveConv());
      let lista: Msg[] | null = null;
      if (id && vivo) { lista = await abrir(id); if (!lista) guardarLS(claveConv(), null); }
      if (!vivo) return;
      const guardado = (l: Msg[] | null) => { const i = (l ?? []).map((x) => x.texto?.trim()).lastIndexOf(pend?.trim() ?? ""); return i >= 0 && (l ?? []).slice(i + 1).some((x) => x.rol === "assistant"); };
      if (pend && guardado(lista)) guardarLS(clavePend(), null);                // ya se guardó con su respuesta
      else if (pend) { setEsperando(pend); if (id) setConvId(id); }             // se salió mientras respondía: se espera a que el servidor termine
      if (borr) setTexto((p) => p || borr);
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (uid.current) guardarLS(claveConv(), convId ?? null); }, [convId]);
  useEffect(() => { if (uid.current) guardarLS(claveBorr(), texto); }, [texto]);
  // Si se salió mientras el asistente respondía, se espera a que termine (el servidor lo guarda al acabar); si no llega, el mensaje vuelve al cuadro
  useEffect(() => {
    if (esperando == null) return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      const id = convId ?? leerLS(claveConv());
      const lista = id ? await abrir(id, true) : null;
      const i = (lista ?? []).map((x) => x.texto?.trim()).lastIndexOf(esperando.trim());
      const llego = i >= 0 && (lista ?? []).slice(i + 1).some((x) => x.rol === "assistant");
      if (llego || n >= 25) {
        clearInterval(t); setEsperando(null); guardarLS(clavePend(), null);
        if (!llego) setTexto((p) => p || esperando);
        else if (id) { setConvId(id); cargarConvs(); }
      }
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esperando]);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function abrir(id: string, silencioso = false): Promise<Msg[] | null> {
    const [{ data: c }, { data: m }, { data: acc }] = await Promise.all([
      db.from("chat_conversaciones").select("id").eq("id", id).maybeSingle(),
      db.from("chat_mensajes").select("id,rol,texto").eq("conversacion_id", id).not("texto", "is", null).order("created_at"),
      db.from("acciones_pendientes").select("id,resumen,tipo,estado").eq("conversacion_id", id).order("created_at"),
    ]);
    if (!c) return null; // no existe o no es de este usuario
    if (!silencioso) { setConvId(id); setHistorial(false); }
    const pend = (acc ?? []) as Accion[];
    const lista = ((m ?? []) as Msg[]).map((x) => ({ ...x }));
    // las tarjetas de revisión de documentos se recomponen a partir del id que queda en el mensaje del documento adjunto
    lista.forEach((x, k) => {
      const id_ = x.rol === "user" ? /\(id ([0-9a-f-]{36})\)/i.exec(x.texto ?? "")?.[1] : undefined;
      if (id_ && lista[k + 1]?.rol === "assistant") lista[k + 1].documentos = [id_];
    });
    const completa = [
      ...lista,
      ...(pend.length ? [{ id: "acc", rol: "assistant" as const, texto: "Acciones de esta conversación:", acciones: pend }] : []),
    ];
    setMsgs(completa);
    return lista;
  }
  function nueva() { setConvId(undefined); setMsgs([]); setHistorial(false); guardarLS(claveConv(), null); }

  function hablar(t: string, alTerminar?: () => void) {
    if (typeof speechSynthesis === "undefined") return alTerminar?.();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t.replace(/[*_`#>|]/g, " ").replace(/\s+/g, " ").trim());
    u.lang = "es-ES";
    u.onend = () => alTerminar?.();
    u.onerror = () => alTerminar?.();
    speechSynthesis.speak(u);
  }

  async function enviarTexto(t: string) {
    t = t.trim();
    if (!t || refs.current.enviando) return;
    guardarLS(clavePend(), t); guardarLS(claveBorr(), null);
    setTexto(""); setEnviando(true); refs.current.enviando = true;
    setMsgs((x) => [...x, { id: crypto.randomUUID(), rol: "user", texto: t }]);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: t, conversacionId: refs.current.convId }) });
      if (!r.ok || !r.body) throw new Error(((await r.json().catch(() => ({}))) as any).error ?? "Error");
      // Respuesta en directo: el texto aparece según se escribe
      const idIA = crypto.randomUUID();
      let acum = "", creado = false;
      const pintar = (extra: Partial<Msg> = {}) => {
        const nuevo = !creado; creado = true;
        setMsgs((x) => nuevo ? [...x, { id: idIA, rol: "assistant", texto: acum, ...extra }] : x.map((m) => m.id === idIA ? { ...m, texto: acum, ...extra } : m));
      };
      let fin: any = null;
      const lector = r.body.getReader(), dec = new TextDecoder();
      let resto = "";
      const trata = (linea: string) => {
        if (!linea.trim()) return;
        let ev: any; try { ev = JSON.parse(linea); } catch { return; }
        if (ev.t === "texto") { acum += ev.d; setEstado(""); pintar(); }
        else if (ev.t === "reset") { acum = ""; if (creado) pintar(); }
        else if (ev.t === "estado") setEstado(ev.d);
        else if (ev.t === "error") throw new Error(ev.error);
        else if (ev.t === "fin") fin = ev;
      };
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        resto += dec.decode(value, { stream: true });
        const ls = resto.split("\n"); resto = ls.pop() ?? "";
        ls.forEach(trata);
      }
      if (resto) trata(resto);
      if (!fin) throw new Error("Se cortó la respuesta. Inténtalo de nuevo.");
      const j = fin;
      setConvId(j.conversacionId); refs.current.convId = j.conversacionId; guardarLS(clavePend(), null);
      acum = j.texto ?? acum;
      pintar({ acciones: j.acciones.map((a: any) => ({ ...a, estado: "pendiente" })), documentos: j.documentos ?? [] });
      cargarConvs();
      if (refs.current.leer || refs.current.manos) {
        const aviso = j.acciones.length ? ` Hay ${j.acciones.length} registro${j.acciones.length > 1 ? "s" : ""} pendiente${j.acciones.length > 1 ? "s" : ""} de confirmar. Confírmalo con el botón de la pantalla.` : "";
        hablar(j.texto + aviso, () => { if (refs.current.manos) refs.current.dictar(); });
      }
    } catch (err) {
      setMsgs((x) => [...x, { id: crypto.randomUUID(), rol: "assistant", texto: `⚠️ ${(err as Error).message}` }]);
      setManos(false);
    } finally { setEnviando(false); setEstado(""); refs.current.enviando = false; }
  }
  refs.current.enviar = enviarTexto;
  const enviar = (e?: React.FormEvent) => { e?.preventDefault(); enviarTexto(texto); };

  async function decidir(mid: string, aid: string, decision: "confirmar" | "cancelar") {
    const r = await fetch(`/api/acciones/${aid}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    const j = await r.json();
    setMsgs((x) => x.map((m) => m.id !== mid ? m : { ...m, acciones: m.acciones?.map((a) => a.id !== aid ? a : r.ok ? { ...a, estado: j.estado, error: undefined } : j.caducada ? { ...a, estado: "caducada" as const, error: undefined } : { ...a, error: j.error }) }));
  }

  const adjunto = useRef<HTMLInputElement>(null);
  async function adjuntar(file: File) {
    const nuevo = (m: Omit<Msg, "id">) => setMsgs((x) => [...x, { id: crypto.randomUUID(), ...m }]);
    nuevo({ rol: "user", texto: `📎 ${file.name}` });
    setEnviando(true);
    try {
      const fd = new FormData(); fd.append("archivo", file);
      const r = await fetch("/api/documentos", { method: "POST", body: fd });
      const j = await r.json();
      let docId: string | undefined = j.id;
      if (!r.ok) {
        if (!j.duplicadoId) return nuevo({ rol: "assistant", texto: `⚠️ ${j.error}` });
        docId = j.duplicadoId; // ya estaba subido: se enseña el que existe
        nuevo({ rol: "assistant", texto: `⚠️ ${j.error}` });
      } else {
        nuevo({ rol: "assistant", texto: "Archivo guardado. Leyendo el documento…" });
        const p = await fetch(`/api/documentos/${j.id}/procesar`, { method: "POST" });
        const pj = await p.json();
        if (!p.ok) nuevo({ rol: "assistant", texto: `Guardé el original pero no pude leerlo: ${pj.error}`, documentos: [j.id] });
      }
      // Constancia en la conversación (para que el asistente sepa de qué documento se habla) + tarjeta de revisión
      const c = await fetch("/api/chat/documento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversacionId: refs.current.convId, documentoId: docId }) });
      const cj = await c.json();
      if (c.ok) {
        setConvId(cj.conversacionId); refs.current.convId = cj.conversacionId; cargarConvs();
        nuevo({ rol: "assistant", texto: cj.texto, documentos: [docId!] });
      } else nuevo({ rol: "assistant", texto: "", documentos: [docId!] });
    } catch { nuevo({ rol: "assistant", texto: "⚠️ Error de conexión al subir el archivo." }); }
    finally { setEnviando(false); }
  }

  function dictar() {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { setManos(false); return alert("Tu navegador no admite dictado por voz (prueba Chrome, Edge o Safari)."); }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    const rec = new SR();
    rec.lang = "es-ES"; rec.interimResults = false;
    rec.onstart = () => setEscuchando(true);
    rec.onend = () => setEscuchando(false);
    rec.onerror = (ev: any) => {
      setEscuchando(false);
      if (ev.error === "not-allowed") { setManos(false); alert("Permite el acceso al micrófono en el navegador para dictar."); }
    };
    rec.onresult = (ev: any) => {
      const dicho = ev.results[0][0].transcript as string;
      if (refs.current.auto || refs.current.manos) refs.current.enviar(dicho);
      else setTexto((p) => (p ? p + " " : "") + dicho);
    };
    try { rec.start(); } catch { /* ya estaba escuchando */ }
  }
  refs.current.dictar = dictar;

  function alternarManos() {
    const v = !manos;
    setManos(v); refs.current.manos = v;
    if (v) { setLeer(true); refs.current.leer = true; dictar(); }
    else if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }

  const sugerencias = ["¿Cómo vamos esta semana?", "¿Cuántos kilos hemos recolectado este mes?", "¿Qué falta por registrar?"];

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col md:h-[calc(100vh-3rem)]">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Chat inteligente</h1>
        <div className="flex gap-2">
          <button className={`btn-ghost ${manos ? "!border-brand-600 !bg-brand-100" : ""}`} onClick={alternarManos} title="Habla, el asistente responde en voz alta y vuelve a escucharte">🎙 {manos ? "Manos libres: activado" : "Manos libres"}</button>
          <button className="btn-ghost" onClick={() => setHistorial((h) => !h)}>🕘 Historial</button>
          <button className="btn-ghost" onClick={nueva}>＋ Nuevo</button>
        </div>
      </div>

      {historial && (
        <div className="card mb-2 max-h-60 space-y-1 overflow-y-auto">
          {convs.length === 0 && <p className="text-sm text-stone-500">Sin conversaciones.</p>}
          {convs.map((c) => (
            <button key={c.id} onClick={() => abrir(c.id)} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-stone-100">
              {c.titulo ?? "Sin título"} <span className="text-xs text-stone-400">{new Date(c.updated_at).toLocaleDateString("es-ES")}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-stone-200 bg-white p-3">
        {msgs.length === 0 && (
          <div className="py-10 text-center text-sm text-stone-500">
            <p className="mb-3">Escribe o dicta: «Hoy han trabajado 8 personas durante 7 horas en la parcela 3».</p>
            <div className="flex flex-wrap justify-center gap-2">
              {sugerencias.map((s) => <button key={s} className="btn-ghost" onClick={() => setTexto(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.rol === "user" ? "justify-end" : ""}`}>
            <div className={`${m.documentos?.length ? "w-full" : "max-w-[85%]"} space-y-2 rounded-2xl px-3 py-2 text-sm ${m.rol === "user" ? "bg-brand-600 text-white" : "bg-stone-100"}`}>
              <p className="whitespace-pre-wrap">{conEnlaces(m.texto)}</p>
              {m.enlace && <a href={m.enlace} className="btn !px-3 !py-1">Abrir →</a>}
              {m.documentos?.map((d) => <RevisionDocumento key={d} id={d} />)}
              {m.acciones?.map((a) => (
                <div key={a.id} className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-stone-900">
                  <p className="whitespace-pre-wrap text-xs font-medium">{a.resumen}</p>
                  {a.estado === "pendiente" ? (
                    <div className="mt-2 flex gap-2">
                      <button className={a.tipo === "anular_registro" ? "btn !bg-red-700 !px-3 !py-1 hover:!bg-red-800" : "btn !px-3 !py-1"} onClick={() => decidir(m.id, a.id, "confirmar")}>
                        {a.tipo === "anular_registro" ? "🗑 Confirmar anulación" : a.tipo === "corregir_registro" ? "✔ Confirmar corrección" : a.tipo === "asignar_tarea" ? "📅 Confirmar asignación" : a.tipo === "cambiar_maestro" ? "📋 Confirmar cambio en Maestros" : a.tipo === "registrar_novedad" ? "📝 Anotar en el diario" : a.tipo === "retirar_novedad" ? "📝 Retirar del diario" : a.tipo === "guardar_memoria" ? "🧠 Guardar en la memoria" : a.tipo === "olvidar_memoria" ? "🧠 Dar de baja de la memoria" : "✔ Confirmar y guardar"}
                      </button>
                      <button className="btn-ghost !px-3 !py-1" onClick={() => decidir(m.id, a.id, "cancelar")}>✕ Cancelar</button>
                    </div>
                  ) : (
                    <p className={`mt-1 text-xs font-semibold ${a.estado === "confirmada" ? "text-green-700" : a.estado === "caducada" ? "text-amber-700" : "text-stone-500"}`}>
                      {a.estado === "confirmada"
                        ? a.tipo === "anular_registro" ? "✔ Registro anulado (queda en el historial)" : a.tipo === "corregir_registro" ? "✔ Corrección guardada (queda en el historial)" : a.tipo === "asignar_tarea" ? "✔ Tarea asignada en el calendario" : a.tipo === "cambiar_maestro" ? "✔ Maestros actualizado" : a.tipo === "registrar_novedad" ? "✔ Anotado en el diario de la finca" : a.tipo === "retirar_novedad" ? "✔ Retirado del diario" : a.tipo === "guardar_memoria" ? "✔ Guardado en la memoria de la empresa" : a.tipo === "olvidar_memoria" ? "✔ Dado de baja de la memoria" : "✔ Guardado en la base de datos"
                        : a.estado === "caducada" ? "El registro cambió desde que se propuso: vuelve a pedirlo desde el chat." : "Cancelado"}
                    </p>
                  )}
                  {a.error && <p className="mt-1 text-xs text-red-600">{a.error}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {(enviando || esperando != null) && <p className="text-sm text-stone-400">{estado || (enviando ? "Pensando…" : "Consultando…")}</p>}
        <div ref={fin} />
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-stone-600">
        <label className="flex items-center gap-1"><input type="checkbox" checked={leer} onChange={(e) => { setLeer(e.target.checked); guarda("chat_leer", e.target.checked); if (!e.target.checked && typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }} /> 🔊 Leer respuestas en voz alta</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); guarda("chat_auto", e.target.checked); }} /> Enviar al terminar de dictar</label>
        <span className="text-stone-400">Los registros siempre se confirman con el botón.</span>
      </div>
      <form onSubmit={enviar} className="mt-1 flex items-end gap-2">
        <input ref={adjunto} type="file" multiple hidden accept=".pdf,.xls,.xlsx,.csv,.docx,.jpg,.jpeg,.png"
          onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; void (async () => { for (const f of fs) await adjuntar(f); })(); }} />
        <button type="button" className="btn-ghost" disabled={enviando} title="Adjuntar factura, albarán, parte, foto…" onClick={() => adjunto.current?.click()}>📎</button>
        <textarea
          className="input max-h-32 min-h-[2.5rem] flex-1 resize-none" rows={1} placeholder="Escribe un mensaje…" value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
        />
        <button type="button" onClick={dictar} className={`btn-ghost ${escuchando ? "!border-red-400 !text-red-600" : ""}`} title="Dictar">🎤</button>
        <button className="btn" disabled={enviando || !texto.trim()}>Enviar</button>
      </form>
    </div>
  );
}
