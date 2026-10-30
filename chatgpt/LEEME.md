# Conectar un GPT de ChatGPT a las horas de campo (solo lectura)

La función `consulta-horas` (Supabase) responde a ChatGPT con los datos de horas. **Solo lee**: no puede registrar ni modificar nada, y no devuelve tarifas ni costes.

## Qué necesitas
- Una cuenta de ChatGPT con GPTs personalizados (Plus o superior).
- La clave de acceso, guardada en el fichero local `.env.chatgpt` de la raíz del proyecto (línea `CLAVE_API=`). Ese fichero no se sube a git.

## Crear el GPT
1. En ChatGPT: **Explorar GPTs → Crear**. Ve a la pestaña **Configurar**.
2. **Nombre:** «Horas Frunet». **Instrucciones:** pega el texto de abajo.
3. Abajo del todo, **Acciones → Crear nueva acción**.
4. **Autenticación:** *Clave de API* → tipo **Bearer** → pega la clave (`CLAVE_API`).
5. **Esquema:** pulsa *Importar desde URL* y pega
   `https://rnsoeznosqoetxtcwdzk.supabase.co/functions/v1/consulta-horas/openapi.json`
6. **Privacidad:** puedes dejarla vacía mientras el GPT sea solo para ti. Guarda el GPT como **«Solo yo»**.
7. Prueba con: «¿Cuántas horas de poda hubo en octubre en Rio Velez?».

## Instrucciones para el GPT (pegar tal cual)
```
Eres el asistente de horas de campo de Frunet. Respondes en español con datos de la acción (solo lectura).
- Antes de filtrar por finca, trabajador, mayor o tarea, si dudas del nombre exacto, llama a obtenerCatalogos.
- Para totales usa resumenHoras (agrupar por trabajador, dia, mes, mayor, tarea o finca). Para ver registros concretos usa registrosHoras.
- Usa siempre fechas AAAA-MM-DD. Si el usuario no da fechas, pregunta el periodo o usa el mes en curso.
- Los «mayores» son: Instalaciones, Suelos, Liado y guiado, Otros cuidados de planta, Riego, Cosecha, Otros y Revisión finca.
- Las horas de tractor son de la finca y el día: no se suman a las del personal; menciónalas aparte.
- Da cifras con dos decimales como máximo, en formato español (1.046,5 h). No inventes datos: si la acción no devuelve algo, dilo.
- No puedes registrar, corregir ni borrar horas: si te lo piden, explica que eso se hace en la app.
```

## Privacidad y control
- Los datos que consultes pasan por OpenAI (nombres y códigos de trabajador incluidos). Para que solo salgan **códigos**, pon `expone_nombres = false` en la fila de la tabla `api_consulta`.
- Para **cortar el acceso** al instante: `update api_consulta set activa = false;` (o borra la fila).
- La función solo acepta una clave cuyo hash esté en `api_consulta`; la clave en sí no se guarda en la base de datos.
