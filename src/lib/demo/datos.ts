import { DEMO_UID } from "./config";

type Row = Record<string, any>;
export type Tablas = Record<string, Row[]>;

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const dia = (hoy: Date, delta: number) => new Date(hoy.getTime() + delta * 864e5).toISOString().slice(0, 10);
const dow = (iso: string) => ((new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7) + 1; // 1 = lunes

// Aleatoriedad determinista: la demo se ve igual en cada arranque
function semilla(s: number) { return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }

let CACHE: Tablas | null = null;

export function datosDemo(): Tablas {
  if (CACHE) return CACHE;
  const hoy = new Date();
  const r = semilla(7);
  const entre = (a: number, b: number) => a + r() * (b - a);
  const redondea = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  const ahora = hoy.toISOString();

  const profiles: Row[] = [
    { id: DEMO_UID, nombre: "Demo (Administrador)", email: "demo@frunet.net", rol: "administrador", activo: true },
    { id: uid(901), nombre: "Laura Gómez", email: "laura@ejemplo.com", rol: "responsable", activo: true },
    { id: uid(902), nombre: "Pedro Ruiz", email: "pedro@ejemplo.com", rol: "encargado", activo: true },
    { id: uid(903), nombre: "Sofía Marín", email: "sofia@ejemplo.com", rol: "consulta", activo: true },
  ];
  const fincas: Row[] = [
    { id: uid(1), codigo: "FM01", nombre: "Finca El Mango", ubicacion: "Vélez-Málaga (Málaga)", responsable_id: uid(901), tipo_explotacion: "propia", superficie_ha: 24.5, observaciones: null, activa: true },
    { id: uid(2), codigo: "LV02", nombre: "Finca La Vega", ubicacion: "Algarrobo (Málaga)", responsable_id: uid(901), tipo_explotacion: "arrendada", superficie_ha: 12, observaciones: null, activa: true },
  ];
  const usuarios_fincas: Row[] = [
    { user_id: uid(901), finca_id: uid(1) }, { user_id: uid(901), finca_id: uid(2) },
    { user_id: uid(902), finca_id: uid(1) }, { user_id: uid(903), finca_id: uid(1) },
  ];
  const campanas: Row[] = [
    { id: uid(11), nombre: "2026/27", fecha_inicio: "2026-06-01", fecha_fin: null },
    { id: uid(12), nombre: "2025/26", fecha_inicio: "2025-06-01", fecha_fin: "2026-05-31" },
  ];
  const P = (n: number, finca: number, codigo: string, nombre: string, ha: number, estado = "activa"): Row =>
    ({ id: uid(n), finca_id: uid(finca), codigo, nombre, superficie_ha: ha, estado, observaciones: null });
  const parcelas: Row[] = [
    P(21, 1, "P1", "Loma alta", 6.2), P(22, 1, "P2", "Barranco", 5.8), P(23, 1, "P3", "Llano grande", 7.5),
    P(24, 1, "P4", "Ladera nueva", 5.0, "en_preparacion"), P(25, 2, "P1", "Vega norte", 6.0), P(26, 2, "P2", "Vega sur", 6.0),
  ];
  const C = (n: number, parcela: number, cultivo: string, variedad: string, plant: string, prev: string | null): Row =>
    ({ id: uid(n), parcela_id: uid(parcela), campana_id: uid(11), cultivo, variedad, fecha_plantacion: plant, fecha_prevista_cosecha: prev, observaciones: null });
  const cultivos_parcela: Row[] = [
    C(31, 21, "Mango", "Osteen", "2016-03-15", null), C(32, 22, "Mango", "Kent", "2017-04-02", dia(hoy, 9)),
    C(33, 23, "Mango", "Osteen", "2015-03-20", null), C(34, 24, "Mango", "Tommy Atkins", "2025-11-10", dia(hoy, 21)),
    C(35, 25, "Aguacate", "Hass", "2018-02-12", dia(hoy, 40)), C(36, 26, "Mango", "Keitt", "2019-03-05", dia(hoy, 4)),
  ];
  const equipos: Row[] = [
    { id: uid(41), finca_id: uid(1), nombre: "Cuadrilla recolección A", coste_hora: 9.5, activo: true },
    { id: uid(42), finca_id: uid(1), nombre: "Cuadrilla recolección B", coste_hora: 9.5, activo: true },
    { id: uid(43), finca_id: uid(2), nombre: "Cuadrilla Vega", coste_hora: null, activo: true },
  ];
  const trabajadores: Row[] = [
    { id: uid(51), finca_id: uid(1), nombre: "Antonio Ruiz (tractorista)", coste_hora: 12, activo: true },
    { id: uid(52), finca_id: uid(1), nombre: "María López", coste_hora: null, activo: true },
  ];

  // Cosechas y partes de los últimos 30 días (sin domingos; se saltan 2 días de partes para ver los avisos)
  const cosechas: Row[] = [], partes: Row[] = [];
  const parcelasCos: [number, number, string, number][] = [[21, 1, "Osteen", 1800], [22, 1, "Kent", 1400], [23, 1, "Osteen", 2300], [26, 2, "Keitt", 900]];
  let n = 1000;
  for (let d = -29; d <= 0; d++) {
    const f = dia(hoy, d);
    if (dow(f) === 7) continue;
    const falta = d === -2 || d === -5;
    for (const [pid, fid, variedad, base] of parcelasCos) {
      if (r() < 0.25) continue;
      const kg = redondea(base * entre(0.55, 1.25), 0) + (d === -1 && pid === 23 ? 6200 : 0); // una cosecha atípica reciente
      const horas = redondea(entre(6, 8), 1), num = Math.round(entre(5, 10));
      cosechas.push({
        id: uid(n++), fecha: f, finca_id: uid(fid), parcela_id: uid(pid), cultivo: "Mango", variedad, campana_id: uid(11),
        kg, cajas: r() < 0.7 ? Math.round(kg / 5) : null, calibre: null, calidad: r() < 0.8 ? "Categoría I" : "Categoría II",
        destino: r() < 0.7 ? "Cooperativa" : "Mercado local", equipo_id: uid(fid === 1 ? 41 : 43), observaciones: null,
        origen: "manual", created_at: ahora,
      });
      if (!falta) {
        const tarifa = fid === 1 ? 9.5 : null;
        partes.push({
          id: uid(n++), fecha: f, finca_id: uid(fid), parcela_id: uid(pid), trabajador_id: null, equipo_id: uid(fid === 1 ? 41 : 43),
          num_trabajadores: num, hora_entrada: null, hora_salida: null, horas_por_trabajador: horas, horas_totales: redondea(num * horas),
          tipo_trabajo: "Recolección", actividad: "Recolección de mango " + variedad, coste_hora: tarifa,
          coste_total: tarifa ? redondea(num * horas * tarifa) : null, observaciones: null, origen: "manual", created_at: ahora,
        });
      }
    }
    if (!falta && r() < 0.4) {
      const horas = 7, num = 3;
      partes.push({
        id: uid(n++), fecha: f, finca_id: uid(1), parcela_id: uid(24), trabajador_id: null, equipo_id: uid(42),
        num_trabajadores: num, hora_entrada: null, hora_salida: null, horas_por_trabajador: horas, horas_totales: num * horas,
        tipo_trabajo: "Preparación", actividad: "Preparación y riego de ladera nueva", coste_hora: 9.5, coste_total: redondea(num * horas * 9.5),
        observaciones: null, origen: "manual", created_at: ahora,
      });
    }
  }
  // Un parte con horas inusuales (para el aviso de anomalías)
  partes.push({
    id: uid(n++), fecha: dia(hoy, -1), finca_id: uid(1), parcela_id: uid(22), trabajador_id: null, equipo_id: uid(41),
    num_trabajadores: 4, hora_entrada: null, hora_salida: null, horas_por_trabajador: 16, horas_totales: 64, tipo_trabajo: "Recolección",
    actividad: "Recolección Kent (revisar)", coste_hora: 9.5, coste_total: 608, observaciones: null, origen: "manual", created_at: ahora,
  });

  const documentos: Row[] = [
    { id: uid(61), nombre: "Factura_Agroquimicos_0425.pdf", tipo: "factura", mime: "application/pdf", tamano_bytes: 184320, storage_path: "demo/1", finca_id: uid(1), parcela_id: null, campana_id: uid(11), fecha_documento: dia(hoy, -12), texto_extraido: "Agroquímicos del Sur S.L. Factura 0425 Fertilizante NPK 1.240,00 EUR", datos_extraidos: { resumen: "Factura de fertilizantes por 1.240 EUR.", registros: [{ tipo: "gasto", fecha: dia(hoy, -12), proveedor: "Agroquímicos del Sur", categoria: "insumos", concepto: "Fertilizante NPK", importe: 1240, moneda: "EUR", dudas: [] }], importados: [0] }, estado: "importado", created_by: DEMO_UID, created_at: ahora },
    { id: uid(62), nombre: "Albaran_cosecha_semana41.xlsx", tipo: "informe_cosecha", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", tamano_bytes: 22450, storage_path: "demo/2", finca_id: uid(2), parcela_id: null, campana_id: uid(11), fecha_documento: dia(hoy, -3), texto_extraido: "Albarán de entrega cooperativa semana 41 Keitt", datos_extraidos: { resumen: "Albarán con 3 entregas de mango Keitt de La Vega.", registros: [
      { tipo: "cosecha", fecha: dia(hoy, -5), parcela: "P2", cultivo: "Mango", variedad: "Keitt", kg: 880, cajas: 176, calidad: "Categoría I", dudas: [] },
      { tipo: "cosecha", fecha: dia(hoy, -4), parcela: "P2", cultivo: "Mango", variedad: "Keitt", kg: 940, cajas: null, calidad: null, dudas: [] },
      { tipo: "cosecha", fecha: dia(hoy, -3), parcela: "P9", cultivo: "Mango", variedad: "Keitt", kg: 15200, cajas: null, calidad: null, dudas: ["La parcela «P9» no figura en la finca", "Cifra de kg muy superior a las demás: ¿falta un punto decimal?"] },
    ], importados: [] }, estado: "procesado", created_by: DEMO_UID, created_at: ahora },
    { id: uid(63), nombre: "Parte_trabajo_foto.jpg", tipo: "foto", mime: "image/jpeg", tamano_bytes: 1802240, storage_path: "demo/3", finca_id: null, parcela_id: null, campana_id: null, fecha_documento: null, texto_extraido: null, datos_extraidos: null, estado: "subido", created_by: DEMO_UID, created_at: ahora },
    { id: uid(64), nombre: "Factura_Combustible_sep.pdf", tipo: "factura", mime: "application/pdf", tamano_bytes: 98304, storage_path: "demo/4", finca_id: uid(1), parcela_id: null, campana_id: uid(11), fecha_documento: dia(hoy, -20), texto_extraido: "Estación de servicio Costa Gasóleo agrícola 612,40 EUR", datos_extraidos: { resumen: "Factura de gasóleo.", registros: [{ tipo: "gasto", fecha: dia(hoy, -20), proveedor: "Costa Gasóleos", categoria: "combustible", concepto: "Gasóleo agrícola", importe: 612.4, moneda: "EUR", dudas: [] }], importados: [0] }, estado: "importado", created_by: DEMO_UID, created_at: ahora },
  ];
  const documentos_esperados: Row[] = [
    { id: uid(71), finca_id: uid(2), descripcion: "Informe de cosecha de septiembre (gestión externa)", tipo: "informe_cosecha", fecha_esperada: dia(hoy, -6), documento_id: null, recibido_at: null },
    { id: uid(72), finca_id: uid(2), descripcion: "Albarán de entrega semana 42", tipo: "albaran", fecha_esperada: dia(hoy, 3), documento_id: null, recibido_at: null },
  ];

  const g = (k: number, delta: number, categoria: string, importe: number, proveedor: string, concepto: string, finca = 1, tipo = "registrado", doc: number | null = null): Row => ({
    id: uid(80 + k), fecha: dia(hoy, delta), proveedor, categoria, concepto, importe, moneda: "EUR", tipo_importe: tipo, finca_id: uid(finca), parcela_id: null,
    campana_id: uid(11), documento_id: doc ? uid(doc) : null, observaciones: null, created_at: ahora,
  });
  const gastos: Row[] = [
    g(1, -12, "insumos", 1240, "Agroquímicos del Sur", "Fertilizante NPK", 1, "registrado", 61), g(2, -20, "combustible", 612.4, "Costa Gasóleos", "Gasóleo agrícola", 1, "registrado", 64),
    g(3, -25, "riego_agua", 880, "Comunidad de Regantes", "Cuota de agua", 1), g(4, -8, "maquinaria", 450, "Talleres Pérez", "Reparación tractor", 1),
    g(5, -3, "transporte", 320, "Transportes Axarquía", "Transporte a cooperativa", 1), g(6, -15, "herramientas", 185.6, "Ferretería Agro", "Tijeras de poda", 2),
    g(7, -10, "mano_obra", 2400, "Gestoría laboral", "Nóminas cuadrilla", 1), g(8, -30, "semillas_plantas", 1500, "Vivero Costa", "Reposición de plantones", 1),
    g(9, 15, "insumos", 3000, "Agroquímicos del Sur", "Presupuesto tratamientos otoño", 1, "presupuesto"), g(10, 30, "riego_agua", 1200, "Comunidad de Regantes", "Estimación riego noviembre", 1, "estimacion"),
    g(11, -9, "insumos", 640, "Agroquímicos del Sur", "Fungicida", 2),
  ];

  const tareas: Row[] = [
    { id: uid(91), titulo: "Tratamiento fitosanitario parcela P3", descripcion: null, tipo: "tratamiento", fecha: dia(hoy, 2), finca_id: uid(1), parcela_id: uid(23), completada: false, asignado_a: null, created_by: DEMO_UID },
    { id: uid(92), titulo: "Revisar riego Vega sur", descripcion: null, tipo: "tarea", fecha: dia(hoy, -3), finca_id: uid(2), parcela_id: uid(26), completada: false, asignado_a: null, created_by: DEMO_UID },
    { id: uid(93), titulo: "Pedir cajas para la cosecha de Kent", descripcion: null, tipo: "recordatorio", fecha: dia(hoy, 6), finca_id: uid(1), parcela_id: null, completada: false, asignado_a: null, created_by: DEMO_UID },
    { id: uid(94), titulo: "Poda de formación P4", descripcion: null, tipo: "tarea", fecha: dia(hoy, -10), finca_id: uid(1), parcela_id: uid(24), completada: true, asignado_a: null, created_by: DEMO_UID },
    { id: uid(95), titulo: "Reunión con la cooperativa", descripcion: null, tipo: "tarea", fecha: dia(hoy, 11), finca_id: null, parcela_id: null, completada: false, asignado_a: null, created_by: DEMO_UID },
  ];
  const av = (k: number, tipo: string, titulo: string, mensaje: string, prioridad: string, estado: string, finca: number | null, delta = 0): Row => ({
    id: uid(100 + k), regla_id: null, tipo, titulo, mensaje, prioridad, finca_id: finca ? uid(finca) : null, destinatario_id: DEMO_UID, estado,
    pospuesto_hasta: estado === "pospuesto" ? dia(hoy, 3) + "T08:00:00Z" : null, created_at: new Date(hoy.getTime() + delta * 864e5).toISOString(),
  });
  const avisos: Row[] = [
    av(1, "cosecha_proxima", "Cosecha próxima: Mango Keitt · parcela P2", `Prevista el ${dia(hoy, 4).split("-").reverse().join("/")} (en 4 día(s)).`, "alta", "pendiente", 2),
    av(2, "falta_parte", `Falta el parte de trabajo del ${dia(hoy, -2).split("-").reverse().join("/")} · Finca El Mango`, "No hay ningún parte registrado ese día.", "media", "pendiente", 1, -1),
    av(3, "anomalia", "Cosecha atípica · parcela P3", "7.800 kg frente a una mediana de 2.300 kg en los últimos 90 días. Comprueba que no es un error.", "alta", "pendiente", 1, -1),
    av(4, "anomalia", "Horas inusuales en parte de ayer · Finca El Mango", "16 h por trabajador (4 personas). ¿Error de registro?", "alta", "pendiente", 1, -1),
    av(5, "doc_pendiente", "Documento pendiente de recibir · Finca La Vega", "Informe de cosecha de septiembre (gestión externa)", "media", "leido", 2, -3),
    av(6, "gasto_sin_justificar", "6 gasto(s) sin justificar · Finca El Mango", "Total 3.780 EUR sin documento adjunto.", "baja", "pospuesto", 1, -4),
    av(7, "resumen_semanal", "Resumen semanal", "Finca El Mango: 31.200 kg · 520 h · coste laboral 4.940 €\nFinca La Vega: 3.100 kg · 96 h · coste laboral 0 € (parcial: partes sin tarifa)", "baja", "resuelto", null, -7),
  ];
  const avisos_reglas: Row[] = [
    { id: uid(111), tipo: "cosecha_proxima", nombre: "Cosechas próximas", finca_id: null, parametros: { dias: 7 }, hora: "08:00:00", periodicidad: "diaria", prioridad: "alta", destinatarios: [], enviar_email: true, activa: true, ultima_ejecucion: ahora, zona_horaria: "Europe/Madrid", dia_semana: 1, dia_mes: 1, created_at: ahora },
    { id: uid(112), tipo: "falta_parte", nombre: "Falta parte de trabajo", finca_id: null, parametros: { dias_atras: 2, dias_semana: [1, 2, 3, 4, 5, 6] }, hora: "09:00:00", periodicidad: "diaria", prioridad: "media", destinatarios: [], enviar_email: true, activa: true, ultima_ejecucion: ahora, zona_horaria: "Europe/Madrid", dia_semana: 1, dia_mes: 1, created_at: ahora },
    { id: uid(113), tipo: "anomalia", nombre: "Posibles errores de registro", finca_id: null, parametros: {}, hora: "18:00:00", periodicidad: "diaria", prioridad: "alta", destinatarios: [], enviar_email: false, activa: true, ultima_ejecucion: ahora, zona_horaria: "Europe/Madrid", dia_semana: 1, dia_mes: 1, created_at: ahora },
    { id: uid(114), tipo: "resumen_semanal", nombre: "Resumen semanal", finca_id: null, parametros: {}, hora: "08:00:00", periodicidad: "semanal", prioridad: "baja", destinatarios: [], enviar_email: true, activa: false, ultima_ejecucion: null, zona_horaria: "Europe/Madrid", dia_semana: 1, dia_mes: 1, created_at: ahora },
  ];
  const objetivos: Row[] = [
    { id: uid(121), finca_id: uid(1), parcela_id: null, periodo: "semanal", kg_objetivo: 16000, activo: true },
    { id: uid(122), finca_id: uid(1), parcela_id: uid(23), periodo: "mensual", kg_objetivo: 45000, activo: true },
  ];

  const chat_conversaciones: Row[] = [
    { id: uid(131), user_id: DEMO_UID, titulo: "¿Cómo vamos esta semana?", created_at: ahora, updated_at: ahora },
    { id: uid(132), user_id: DEMO_UID, titulo: "Hoy han trabajado 8 personas durante 7 horas…", created_at: ahora, updated_at: dia(hoy, -1) + "T10:00:00Z" },
  ];
  const chat_mensajes: Row[] = [
    { id: uid(141), conversacion_id: uid(131), rol: "user", texto: "¿Cómo vamos esta semana?", contenido: "", created_at: ahora },
    { id: uid(142), conversacion_id: uid(131), rol: "assistant", texto: "Datos de ejemplo (modo demo): esta semana se han registrado cosechas en 3 parcelas de Finca El Mango. Falta el parte de trabajo de hace 2 días.", contenido: [], created_at: ahora },
  ];
  const acciones_pendientes: Row[] = [
    { id: uid(151), conversacion_id: uid(132), user_id: DEMO_UID, tipo: "registrar_parte", payload: {}, resumen: "Parte de trabajo · hoy · Finca El Mango · parcela P3\n8 trabajadores × 7 h = 56 h", estado: "pendiente", resultado_id: null, created_at: ahora },
  ];

  const audit_log: Row[] = [
    { id: 1, tabla: "cosechas", registro_id: cosechas[0]?.id, accion: "INSERT", usuario_id: uid(902), antes: null, despues: cosechas[0], fecha: dia(hoy, -29) + "T09:00:00Z" },
    { id: 2, tabla: "cosechas", registro_id: cosechas[0]?.id, accion: "UPDATE", usuario_id: uid(901), antes: { ...cosechas[0], kg: 1500 }, despues: cosechas[0], fecha: dia(hoy, -28) + "T10:30:00Z" },
    { id: 3, tabla: "fincas", registro_id: uid(2), accion: "UPDATE", usuario_id: DEMO_UID, antes: { superficie_ha: 10 }, despues: { superficie_ha: 12 }, fecha: dia(hoy, -2) + "T12:00:00Z" },
  ];

  CACHE = {
    profiles, fincas, usuarios_fincas, campanas, parcelas, cultivos_parcela, equipos, trabajadores, cosechas, partes_trabajo: partes,
    documentos, documentos_esperados, gastos, tareas, avisos, avisos_reglas, objetivos, chat_conversaciones, chat_mensajes,
    acciones_pendientes, audit_log,
  };
  return CACHE;
}
