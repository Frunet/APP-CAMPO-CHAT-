/**
 * Canales de notificación. Cada canal es independiente: añadir push móvil = implementar `push`
 * (p. ej. Web Push con VAPID usando la tabla push_suscripciones) y registrarlo en CANALES.
 */
export type AvisoSalida = { id: string; titulo: string; mensaje: string | null; prioridad: string; enlace?: string };
export type Destinatario = { id: string; nombre: string; email: string | null };
export interface Canal {
  nombre: "email" | "push";
  /** Devuelve los ids de aviso entregados correctamente. */
  enviar(dest: Destinatario, avisos: AvisoSalida[]): Promise<{ entregados: string[]; error?: string }>;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const COLOR: Record<string, string> = { critica: "#b91c1c", alta: "#c2410c", media: "#a16207", baja: "#57534e" };

export const email: Canal = {
  nombre: "email",
  async enviar(dest, avisos) {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) return { entregados: [], error: "Correo no configurado (RESEND_API_KEY / EMAIL_FROM)" };
    if (!dest.email) return { entregados: [], error: "Usuario sin correo" };
    const base = process.env.APP_URL ?? "";
    const filas = avisos.map((a) =>
      `<tr><td style="padding:8px 0;border-bottom:1px solid #e7e5e4"><b style="color:${COLOR[a.prioridad] ?? "#444"}">${esc(a.titulo)}</b>` +
      (a.mensaje ? `<br><span style="white-space:pre-line">${esc(a.mensaje)}</span>` : "") +
      (base ? `<br><a href="${esc(base + (a.enlace ?? "/avisos"))}">Abrir en la aplicación</a>` : "") + `</td></tr>`).join("");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [dest.email],
        subject: avisos.length === 1 ? avisos[0].titulo : `${avisos.length} avisos de tus fincas`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px"><p>Hola ${esc(dest.nombre)},</p><table style="width:100%;border-collapse:collapse">${filas}</table></div>`,
      }),
    });
    if (!r.ok) return { entregados: [], error: `Resend ${r.status}` };
    return { entregados: avisos.map((a) => a.id) };
  },
};

/** Reservado: sin implementar. Al activarlo, leer push_suscripciones del usuario y usar web-push. */
export const push: Canal = {
  nombre: "push",
  async enviar() { return { entregados: [], error: "Push no implementado todavía" }; },
};

export const CANALES: Canal[] = [email]; // añadir `push` aquí cuando exista
