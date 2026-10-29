/**
 * Adaptador de Gemini (Google) con la forma de `anthropic.messages.create`, para poder probar la app con una clave gratuita
 * sin tocar el resto del código. Los mensajes se guardan en formato Anthropic (text / tool_use / tool_result / document / image).
 * Solo se usa si IA_PROVIDER=gemini. Con Claude no interviene.
 */
type Bloque = Record<string, any>;
type Mensaje = { role: "user" | "assistant"; content: string | Bloque[] };
type Herramienta = { name: string; description?: string; input_schema?: Record<string, any> };

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export function modeloGemini(modelo: string): string {
  const env = process.env;
  if (/^claude-haiku/.test(modelo)) return env.GEMINI_MODEL_SIMPLE || env.GEMINI_MODEL || "gemini-2.5-flash";
  if (/^claude-/.test(modelo)) return env.GEMINI_MODEL_COMPLEX || env.GEMINI_MODEL || "gemini-2.5-flash";
  return modelo; // ya es un nombre de Gemini
}

/** JSON Schema → subconjunto de OpenAPI que acepta Gemini (sin uniones con null, sin additionalProperties…). */
export function limpiarSchema(s: any): any {
  if (Array.isArray(s)) return s.map(limpiarSchema);
  if (!s || typeof s !== "object") return s;
  const o: any = {};
  for (const [k, v] of Object.entries(s)) {
    if (["$schema", "additionalProperties", "default", "title", "examples", "$id", "$ref", "pattern", "minLength", "maxLength", "minimum", "maximum"].includes(k)) continue;
    if (k === "type" && Array.isArray(v)) {
      const t = (v as string[]).filter((x) => x !== "null");
      o.type = t[0] ?? "string";
      if (t.length !== (v as string[]).length) o.nullable = true;
    } else if (k === "enum" && Array.isArray(v)) {
      const e = (v as unknown[]).filter((x) => x !== null);
      o.enum = e.map(String);
      if (e.length !== (v as unknown[]).length) o.nullable = true;
    } else if (k === "properties" && v && typeof v === "object") {
      o.properties = Object.fromEntries(Object.entries(v as object).map(([p, x]) => [p, limpiarSchema(x)]));
    } else if (k === "items") o.items = limpiarSchema(v);
    else o[k] = v;
  }
  if (o.type === "object" && !o.properties) o.properties = {};
  if (o.type === "array" && !o.items) o.items = { type: "string" };
  return o;
}

const aTexto = (c: unknown) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x: any) => (typeof x === "string" ? x : x?.text ?? JSON.stringify(x))).join("\n") : JSON.stringify(c));
const respuestaObjeto = (contenido: unknown) => {
  const t = aTexto(contenido);
  try { const j = JSON.parse(t); return j && typeof j === "object" && !Array.isArray(j) ? j : { resultado: j }; } catch { return { resultado: t }; }
};

/** Mensajes Anthropic → contents de Gemini. */
export function aContents(messages: Mensaje[]) {
  const nombrePorId = new Map<string, string>();
  const contents: { role: "user" | "model"; parts: any[] }[] = [];
  for (const m of messages) {
    const bloques: Bloque[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    const parts: any[] = [];
    const respuestas: any[] = [];
    for (const b of bloques) {
      if (b.type === "text") { if (String(b.text ?? "").length) parts.push({ text: b.text }); }
      else if (b.type === "tool_use") {
        nombrePorId.set(b.id, b.name);
        const p: any = { functionCall: { name: b.name, args: b.input ?? {} } };
        if (b.thought_signature) p.thoughtSignature = b.thought_signature;
        parts.push(p);
      } else if (b.type === "tool_result") {
        respuestas.push({ functionResponse: { name: nombrePorId.get(b.tool_use_id) ?? "herramienta", response: respuestaObjeto(b.content) } });
      } else if ((b.type === "document" || b.type === "image") && b.source?.type === "base64") {
        parts.push({ inlineData: { mimeType: b.source.media_type, data: b.source.data } });
      }
    }
    if (m.role === "assistant") { if (parts.length) contents.push({ role: "model", parts }); }
    else {
      const todas = [...respuestas, ...parts];
      if (todas.length) contents.push({ role: "user", parts: todas });
    }
  }
  return contents;
}

async function llamar(url: string, cuerpo: unknown, intentos = 3): Promise<any> {
  let ultimo: any;
  for (let i = 0; i < intentos; i++) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" }, body: JSON.stringify(cuerpo) });
    if (r.ok) return r.json();
    const txt = await r.text();
    ultimo = Object.assign(new Error(`Gemini ${r.status}: ${txt.slice(0, 300)}`), { status: r.status, diario: r.status === 429 && /PerDay/.test(txt) });
    if (r.status === 429 && /PerDay/.test(txt)) break; // límite diario de la clave gratuita: reintentar no sirve
    if (r.status === 429 || r.status === 503) { await new Promise((ok) => setTimeout(ok, 2500 * (i + 1))); continue; }
    break;
  }
  throw ultimo;
}

/** Igual que `llamar` pero leyendo la respuesta por trozos (SSE): avisa del texto según llega y devuelve el mismo objeto que generateContent. */
async function llamarStream(url: string, cuerpo: unknown, onText: (d: string) => void): Promise<any> {
  let r!: Response, ultimo: any;
  for (let i = 0; i < 3; i++) {
    r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" }, body: JSON.stringify(cuerpo) });
    if (r.ok) { ultimo = null; break; }
    const txt = await r.text();
    ultimo = Object.assign(new Error(`Gemini ${r.status}: ${txt.slice(0, 300)}`), { status: r.status, diario: r.status === 429 && /PerDay/.test(txt) });
    if (r.status === 429 && /PerDay/.test(txt)) break;
    if (r.status === 429 || r.status === 503) { await new Promise((ok) => setTimeout(ok, 2500 * (i + 1))); continue; }
    break;
  }
  if (ultimo) throw ultimo;
  const parts: any[] = [];
  let finishReason: string | undefined, usageMetadata: any, promptFeedback: any;
  const dec = new TextDecoder();
  let resto = "";
  const trata = (linea: string) => {
    if (!linea.startsWith("data:")) return;
    let c: any; try { c = JSON.parse(linea.slice(5).trim()); } catch { return; }
    if (c.promptFeedback) promptFeedback = c.promptFeedback;
    if (c.usageMetadata) usageMetadata = c.usageMetadata;
    const cand = c.candidates?.[0];
    if (cand?.finishReason) finishReason = cand.finishReason;
    for (const part of cand?.content?.parts ?? []) {
      parts.push(part);
      if (!part.thought && typeof part.text === "string" && part.text) onText(part.text);
    }
  };
  for await (const trozo of r.body as unknown as AsyncIterable<Uint8Array>) {
    resto += dec.decode(trozo, { stream: true });
    const lineas = resto.split(/\r?\n/); resto = lineas.pop() ?? "";
    lineas.forEach(trata);
  }
  if (resto) trata(resto);
  // Trozos de texto contiguos → un solo bloque (si no, se unirían con saltos de línea)
  const unidas: any[] = [];
  for (const p of parts) {
    const ant = unidas[unidas.length - 1];
    if (ant && typeof p.text === "string" && typeof ant.text === "string" && !p.thought && !ant.thought && !p.functionCall) {
      ant.text += p.text; if (p.thoughtSignature) ant.thoughtSignature = p.thoughtSignature;
    } else unidas.push({ ...p });
  }
  return { candidates: [{ content: { parts: unidas }, finishReason }], usageMetadata, promptFeedback };
}

let contador = 0;
export async function crearConGemini(p: { model: string; system?: string; messages: Mensaje[]; tools?: Herramienta[]; max_tokens?: number }, onText?: (d: string) => void) {
  if (!process.env.GEMINI_API_KEY) throw new Error("Falta GEMINI_API_KEY");
  const modelo = modeloGemini(p.model);
  const cuerpo: any = {
    contents: aContents(p.messages),
    generationConfig: { maxOutputTokens: Math.min(p.max_tokens ?? 8000, 32000) },
  };
  if (p.system) cuerpo.systemInstruction = { parts: [{ text: p.system }] };
  if (p.tools?.length) {
    cuerpo.tools = [{ functionDeclarations: p.tools.map((t) => ({ name: t.name, description: t.description ?? "", parameters: limpiarSchema(t.input_schema ?? { type: "object", properties: {} }) })) }];
    cuerpo.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }
  const url = (m: string) => `${BASE}/models/${encodeURIComponent(m)}:${onText ? "streamGenerateContent?alt=sse" : "generateContent"}`;
  const pedir = (m: string) => (onText ? llamarStream(url(m), cuerpo, onText) : llamar(url(m), cuerpo));
  let j: any;
  try { j = await pedir(modelo); }
  catch (e: any) {
    // Agotado el cupo diario del modelo potente: seguir con el ligero en vez de dejar el chat parado
    const ligero = process.env.GEMINI_MODEL_SIMPLE;
    if (e?.diario && ligero && ligero !== modelo) j = await pedir(ligero);
    else throw e;
  }
  const cand = j.candidates?.[0];
  if (!cand?.content?.parts?.length) {
    const motivo = j.promptFeedback?.blockReason ?? cand?.finishReason ?? "sin respuesta";
    throw new Error(`Gemini no devolvió contenido (${motivo})`);
  }
  const content: Bloque[] = [];
  let hayHerramienta = false;
  for (const part of cand.content.parts) {
    if (part.thought) continue; // resúmenes de razonamiento: no se muestran ni se guardan
    if (typeof part.text === "string" && part.text) content.push({ type: "text", text: part.text });
    if (part.functionCall) {
      hayHerramienta = true;
      const b: Bloque = { type: "tool_use", id: `gem_${Date.now().toString(36)}_${contador++}`, name: part.functionCall.name, input: part.functionCall.args ?? {} };
      if (part.thoughtSignature) b.thought_signature = part.thoughtSignature; // Gemini 3 lo exige al devolver la llamada
      content.push(b);
    }
  }
  return { id: `gemini_${Date.now()}`, type: "message", role: "assistant", model: modelo, content, stop_reason: hayHerramienta ? "tool_use" : cand.finishReason === "MAX_TOKENS" ? "max_tokens" : "end_turn", usage: j.usageMetadata ?? {} };
}

export async function listarModelosGemini(): Promise<string[]> {
  const r = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" } });
  if (!r.ok) throw new Error(`Gemini ${r.status}`);
  const j = await r.json();
  return ((j.models ?? []) as any[]).filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent")).map((m) => String(m.name).replace(/^models\//, ""));
}
