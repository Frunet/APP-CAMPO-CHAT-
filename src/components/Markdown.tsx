import type { ReactNode } from "react";

/**
 * Formato de las respuestas del asistente (como en ChatGPT): **negrita**, *cursiva*, `código`, títulos, listas, tablas, citas y enlaces.
 * Pequeño y sin dependencias; no interpreta HTML (todo se pinta como texto) y solo admite enlaces internos de descarga o https.
 */
const enlaceOk = (u: string) => /^\/api\//.test(u) || /^https:\/\//.test(u);

function enLinea(t: string, k = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*\s][^*]*)\*|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let i = 0, m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(t))) {
    if (m.index > i) out.push(t.slice(i, m.index));
    const key = `${k}-${n++}`;
    if (m[2] ?? m[3]) out.push(<strong key={key}>{m[2] ?? m[3]}</strong>);
    else if (m[4]) out.push(<code key={key} className="rounded bg-stone-200/70 px-1 py-0.5 text-[0.85em]">{m[4]}</code>);
    else if (m[5]) out.push(<em key={key}>{m[5]}</em>);
    else if (m[6] && enlaceOk(m[7])) out.push(<a key={key} href={m[7]} className="font-medium text-brand-700 underline">{/^\/api\//.test(m[7]) ? "⬇ " : ""}{m[6]}</a>);
    else out.push(m[0]);
    i = m.index + m[0].length;
  }
  if (i < t.length) out.push(t.slice(i));
  return out;
}

const esFilaTabla = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const celdas = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export default function Markdown({ texto }: { texto: string }) {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const bloques: ReactNode[] = [];
  let i = 0, b = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (!l.trim()) { i++; continue; }

    if (/^```/.test(l)) { // bloque de código
      const cod: string[] = []; i++;
      while (i < lineas.length && !/^```/.test(lineas[i])) cod.push(lineas[i++]);
      i++;
      bloques.push(<pre key={b++} className="overflow-x-auto rounded-lg bg-stone-800 p-3 text-xs text-stone-100">{cod.join("\n")}</pre>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { bloques.push(<p key={b++} className={`font-semibold ${h[1].length <= 2 ? "text-base" : ""}`}>{enLinea(h[2], b)}</p>); i++; continue; }

    if (esFilaTabla(l) && i + 1 < lineas.length && /^\s*\|[\s:|-]+\|\s*$/.test(lineas[i + 1])) { // tabla
      const cab = celdas(l); i += 2;
      const filas: string[][] = [];
      while (i < lineas.length && esFilaTabla(lineas[i])) filas.push(celdas(lineas[i++]));
      bloques.push(
        <div key={b++} className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead><tr>{cab.map((c, j) => <th key={j} className="border-b border-stone-300 px-2 py-1 text-left font-semibold">{enLinea(c, j)}</th>)}</tr></thead>
            <tbody>{filas.map((f, r) => <tr key={r} className="odd:bg-stone-50">{f.map((c, j) => <td key={j} className="border-b border-stone-200 px-2 py-1">{enLinea(c, j)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    const lista = /^\s*([-*•]|\d+[.)])\s+/;
    if (lista.test(l)) { // lista con o sin números
      const ord = /^\s*\d+[.)]\s+/.test(l);
      const items: string[] = [];
      while (i < lineas.length && lista.test(lineas[i])) items.push(lineas[i++].replace(lista, ""));
      const Tag = ord ? "ol" : "ul";
      bloques.push(<Tag key={b++} className={`space-y-1 pl-5 ${ord ? "list-decimal" : "list-disc"}`}>{items.map((t, j) => <li key={j}>{enLinea(t, j)}</li>)}</Tag>);
      continue;
    }

    if (/^>\s?/.test(l)) {
      const q: string[] = [];
      while (i < lineas.length && /^>\s?/.test(lineas[i])) q.push(lineas[i++].replace(/^>\s?/, ""));
      bloques.push(<blockquote key={b++} className="border-l-4 border-stone-300 pl-3 text-stone-600">{enLinea(q.join(" "), b)}</blockquote>);
      continue;
    }

    const par: string[] = []; // párrafo: líneas seguidas hasta una en blanco u otro bloque
    while (i < lineas.length && lineas[i].trim() && !/^(```|#{1,4}\s|>\s?)/.test(lineas[i]) && !lista.test(lineas[i]) && !esFilaTabla(lineas[i])) par.push(lineas[i++]);
    if (!par.length) { par.push(lineas[i++]); }
    bloques.push(
      <p key={b++}>{par.map((t, j) => <span key={j}>{j > 0 && <br />}{enLinea(t, j)}</span>)}</p>,
    );
  }
  return <div className="space-y-2 leading-relaxed">{bloques}</div>;
}
