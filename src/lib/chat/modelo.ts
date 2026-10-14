// Modelo barato para consultas; modelo potente para registrar datos y para lo ambiguo.
export const MODELO_SIMPLE = process.env.CHAT_MODEL_SIMPLE ?? "claude-haiku-5-5";
export const MODELO_COMPLEJO = process.env.CHAT_MODEL_COMPLEX ?? "claude-sonnet-5-5";

// Órdenes explícitas de escritura: cuentan siempre, aunque el mensaje parezca pregunta
const ORDEN =
  /\b(registr\w*|anot\w*|apunt\w*|guard\w*|a[ñn]ad\w*|cre[ae]\w*|adjunt\w*|corrig\w*|modific\w*|elimin\w*|borr\w*|cancel\w*|av[ií]sa\w*|recu[eé]rda\w*|programa\w*|recordatorio)/i;

// Relatos de trabajo/cosecha y cifras con unidades: solo cuentan si NO es una pregunta
const RELATO =
  /\b(han|hemos|he|ha)\s+(trabajad\w*|recolect\w*|cosech\w*|recogid\w*|pagad\w*|compr\w*|gastad\w*)|\d[\d.,]*\s?(kg|kilos?|kilogramos?|cajas?|horas?|h\b|€|euros?|personas?|trabajadores?|jornales?)/i;

const esPregunta = (m: string) => /^\s*¿/.test(m) || /\?\s*$/.test(m);

/**
 * Decide el modelo de ESTE mensaje.
 * - Sonnet si parece que se quiere registrar/modificar algo, si hay una propuesta pendiente de confirmar
 *   o si el asistente acaba de pedir una aclaración (continuación de un registro).
 * - Haiku para el resto (consultas de solo lectura).
 * Si Haiku intenta preparar un registro igualmente, la ruta del chat lo descarta y repite con Sonnet.
 */
export function elegirModelo(mensaje: string, opts: { hayPendientes: boolean; ultimaRespuestaEsPregunta: boolean }) {
  const escribe = ORDEN.test(mensaje) || (!esPregunta(mensaje) && RELATO.test(mensaje));
  return escribe || opts.hayPendientes || opts.ultimaRespuestaEsPregunta ? MODELO_COMPLEJO : MODELO_SIMPLE;
}
