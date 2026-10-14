/** Modo demo: sin Supabase ni claves, con datos ficticios en memoria y sin guardar nada. Se activa con NEXT_PUBLIC_DEMO=1. */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
export const DEMO_UID = "00000000-0000-4000-8000-00000000d000";
export const MSG_DEMO = "Modo demo: los datos son de ejemplo y los cambios no se guardan.";
