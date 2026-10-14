import { datosDemo } from "./datos";

const n0 = (x: number) => x.toLocaleString("es-ES", { maximumFractionDigits: 0 });
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Respuestas de muestra del chat en modo demo: sin IA; las cifras salen de los datos ficticios. */
export function respuestaDemo(mensaje: string) {
  const T = datosDemo();
  const m = mensaje.toLowerCase();
  const hoy = new Date();
  const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  const desde = iso(lunes), hasta = iso(hoy);
  const base = { conversacionId: "00000000-0000-4000-8000-000000000132", modelo: "demo", acciones: [] as { id: string; resumen: string; tipo?: string }[] };

  if (/anul|elimin|borra/.test(m)) {
    return {
      ...base,
      texto: "Esto es una demostración: así prepararía la anulación. Se elimina el registro y queda constancia en el historial. Pulsa Confirmar para anularlo (aquí no se cambia nada).",
      acciones: [{ id: "00000000-0000-4000-8000-0000000000ab", tipo: "anular_registro", resumen: "Anular cosecha\n13/10/2026 · Finca El Mango · parcela P3 · Mango Osteen · 2.140 kg\nMotivo: duplicada\nSe eliminará de la base de datos y quedará constancia en el historial." }],
    };
  }
  if (/corrig|cambia|rectific|equivoc/.test(m)) {
    return {
      ...base,
      texto: "Esto es una demostración: así prepararía la corrección, enseñando el antes y el después. Pulsa Confirmar para aplicarla (aquí no se cambia nada).",
      acciones: [{ id: "00000000-0000-4000-8000-0000000000ac", tipo: "corregir_registro", resumen: "Corrección de parte de trabajo\n13/10/2026 · Finca El Mango · parcela P2 · 6 persona(s) × 7,7 h · Recolección\n• Horas por persona: 7,7 → 8\n• Horas extra por persona: — → 1\nEl coste se recalculará con las tarifas." }],
    };
  }
  if (/registr|han trabajado|hemos|apunta|anota|cosecha del/.test(m)) {
    return {
      ...base,
      texto: "Esto es una demostración: así prepararía el registro. Compruébalo y pulsa Confirmar para guardarlo (en la versión real se guarda en la base de datos; aquí no se guarda nada).",
      acciones: [{ id: "00000000-0000-4000-8000-0000000000aa", resumen: "Parte de trabajo · hoy · Finca El Mango · parcela P3\n8 trabajadores × 7 h = 56 h\nCoste: se calculará si hay tarifa configurada" }],
    };
  }
  if (/semana|vamos|kilos|kg|recolect|produc/.test(m)) {
    const c = T.cosechas.filter((r) => r.fecha >= desde && r.fecha <= hasta);
    const p = T.partes_trabajo.filter((r) => r.fecha >= desde && r.fecha <= hasta);
    const kg = c.reduce((a, r) => a + Number(r.kg), 0), h = p.reduce((a, r) => a + Number(r.horas_totales), 0);
    const sin = p.some((r) => r.coste_total == null);
    return {
      ...base,
      texto: `(Datos de ejemplo del modo demo) Del ${desde.split("-").reverse().join("/")} al ${hasta.split("-").reverse().join("/")}: ${n0(kg)} kg cosechados en ${c.length} registros y ${n0(h)} h de mano de obra en ${p.length} partes${sin ? "; hay partes sin tarifa, así que el coste laboral es parcial" : ""}. En la versión real, el asistente consulta tus registros y siempre indica el periodo.`,
    };
  }
  return {
    ...base,
    texto: "Modo demo: aquí el asistente no está conectado a la IA. Prueba con «¿Cómo vamos esta semana?» o con «Hoy han trabajado 8 personas durante 7 horas en la parcela 3» para ver cómo responde y cómo pide confirmación.",
  };
}
