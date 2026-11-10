# Conectar un GPT de ChatGPT a los datos de campo (solo lectura)

La función `consulta-horas` (Supabase) responde a ChatGPT con los datos de la app. **Solo lee**: no puede registrar ni modificar nada.

## Qué puede consultar
| Bloque | Conjuntos |
|---|---|
| Campo | `fincas`, `parcelas`, `cultivos_asignados`, `cultivos`, `campanas`, `festivos` |
| Personal | `trabajadores`, `equipos` |
| Horas | `resumenHoras` / `registrosHoras` (específicos y más completos), `horas_tractor` |
| Producción | `cosechas` (kg, cajas, calidad, destino), `produccion_anual` (kg) |
| Organización | `tareas` (calendario), `diario`, `documentos` (lista, sin su contenido) |
| **Económicos (apagado)** | `gastos`, `ventas`, `movimientos`, `costes_generales`, `coste_horas`, `tarifas`, `proveedores`, e importes de `produccion_anual` |

Se pueden **filtrar** (fechas, finca, texto, `campo=valor`) y **agrupar y sumar** (p. ej. «kg de Mango por finca y mes»).

## Qué necesitas
- Una cuenta de ChatGPT con GPTs personalizados (Plus o superior).
- La clave de acceso, guardada en el fichero local `.env.chatgpt` de la raíz del proyecto (línea `CLAVE_API=`). Ese fichero no se sube a git.

## Crear el GPT
1. En ChatGPT: **Explorar GPTs → Crear**. Ve a la pestaña **Configurar**.
2. **Nombre:** «Datos Frunet». **Instrucciones:** pega el texto de abajo.
3. Abajo del todo, **Acciones → Crear nueva acción**.
4. **Autenticación:** *Clave de API* → tipo **Bearer** → pega la clave (`CLAVE_API`).
5. **Esquema:** *Importar desde URL* y pega
   `https://rnsoeznosqoetxtcwdzk.supabase.co/functions/v1/consulta-horas/openapi.json`
   (Si ya lo habías creado con la versión anterior, vuelve a importar el esquema para que aparezcan las operaciones nuevas.)
6. Guarda el GPT como **«Solo yo»**.
7. Prueba con: «¿Cuántos kg de aguacate se han cosechado este año por finca?» o «¿Qué tareas tengo pendientes esta semana?».

## Instrucciones para el GPT (pegar tal cual)
```
Eres el asistente de datos de campo de Frunet. Respondes en español usando solo los datos de la acción (solo lectura).
- Empieza llamando a listarConjuntos si no sabes qué datos hay o qué campos se pueden filtrar, agrupar o sumar.
- Para horas del personal usa resumenHoras (totales agrupados) y registrosHoras (registros). Para el resto usa consultarDatos (filas) y resumenDatos (totales agrupados).
- Usa fechas AAAA-MM-DD. Si el usuario no da fechas, pregunta el periodo o usa el mes o año en curso.
- Los «mayores» de horas son: Instalaciones, Suelos, Liado y guiado, Otros cuidados de planta, Riego, Cosecha, Otros y Revisión finca.
- Las horas de tractor son de la finca y el día: no se suman a las del personal; menciónalas aparte.
- Si un conjunto da error 403, no tienes permiso para ese dato (es económico): dilo sin insistir.
- Da cifras en formato español (1.046,5 h; 12.300 kg) y no inventes datos: si la acción no devuelve algo, dilo.
- No puedes registrar, corregir ni borrar nada: si te lo piden, explica que eso se hace en la app.
```

## Interruptores y control (en Supabase → SQL Editor)
- **Datos económicos** (apagados por defecto): `update public.api_consulta set incluye_finanzas = true;`  (y `false` para volver a apagarlos).
- **Solo códigos de trabajador, sin nombres:** `update public.api_consulta set expone_nombres = false;`
- **Cortar el acceso al instante:** `update public.api_consulta set activa = false;`

## Privacidad
La consulta reconoce los grupos PAI (PAI MANGO, Casa y Fortaleza), FRUNET (Río Vélez) y LOMAS (LOMAS, Loma Mecias, Loma Nisperos y Río Seco). Un trabajador conserva una sola ficha, aunque figure activo en varias fincas. Para contar personas únicas usa el total del conjunto; los grupos pueden compartir personas. Puedes preguntar «¿Qué trabajadores están activos en PAI?» o «Compara las horas de PAI, FRUNET y LOMAS del 3 al 7 de noviembre de 2026». Reimporta el esquema de acciones si tu GPT conserva una versión anterior. El acceso sigue siendo de solo lectura y los datos económicos continúan desactivados.

Los datos que se consultan pasan por OpenAI (incluidos nombres y códigos de trabajador si `expone_nombres` está activo). La clave en sí no se guarda en la base de datos, solo su hash.
