import Anthropic from "@anthropic-ai/sdk";
import { crearConGemini } from "./gemini";

/**
 * Cliente de IA de la aplicación. Por defecto Claude (ANTHROPIC_API_KEY).
 * Con IA_PROVIDER=gemini (y GEMINI_API_KEY) usa Gemini mediante un adaptador, pensado para pruebas con una clave gratuita.
 */
export const proveedorIA = () => (process.env.IA_PROVIDER === "gemini" ? "gemini" : "anthropic");

export function clienteIA(): Anthropic {
  if (proveedorIA() === "gemini") {
    return { messages: { create: (p: any) => crearConGemini(p) } } as unknown as Anthropic;
  }
  return new Anthropic(); // ANTHROPIC_API_KEY solo en servidor
}
