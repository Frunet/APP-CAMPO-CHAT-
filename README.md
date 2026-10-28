# Control de Fincas · Fase 1

Next.js 16 + Supabase (Postgres/RLS/Auth/Storage) + Claude API.

## Ver la app sin configurar nada (modo demo)
**En local:**
```bash
echo NEXT_PUBLIC_DEMO=1 > .env.local
npm install
npm run dev
```
Con `NEXT_PUBLIC_DEMO=1` la app no necesita Supabase ni claves: usa datos ficticios en memoria (`src/lib/demo/`), no guarda nada (los formularios responden «Modo demo…»), el chat devuelve respuestas de muestra y la subida de archivos está desactivada. Para desplegarlo en Vercel, importa el repositorio y define esa variable de entorno. **Nunca la actives en producción.**

## Arranque en el servidor (Windows, como la app de mantenimiento)
- `iniciar.bat`: doble clic para arrancar (instala y compila la primera vez). Abrir `http://localhost:3000`; desde móviles de la red: `http://<IP-del-PC>:3000`.
- `instalar_arranque_automatico.ps1`: ejecutar **una vez como administrador**; abre el puerto 3000 en el firewall (redes privadas) y hace que la app arranque sola con Windows (tarea `AppCampo`).
- Tras cambiar código o `.env.local`: `npm run build` y reiniciar (`Restart-ScheduledTask`/`Start-ScheduledTask AppCampo`, o cerrar y abrir `iniciar.bat`).
- **Voz en el móvil:** el navegador solo permite micrófono y dictado en **HTTPS** (o `localhost`). Por `http://IP:3000` el chat funciona escribiendo, pero el dictado no. Para usar la voz desde el móvil hay que servir la app por HTTPS (p. ej. un túnel seguro o un proxy con certificado).

## Base de datos propia en el PC (Supabase de código abierto con Docker)
Carpeta `supabase-propio/`: instalación guiada en 4 pasos (`1_instalar`, `2_aplicar_migraciones`, `3_crear_administrador`, `4_configurar_app`), firewall, copias de seguridad programadas y arranque. Léela entera en [`supabase-propio/LEEME.md`](supabase-propio/LEEME.md). La base de datos vive en `C:\supabase-campo` (fuera de OneDrive) y la API en el puerto 8100.

## Puesta en marcha
1. Crear un proyecto Supabase y ejecutar, en orden, `supabase/migrations/0001_schema.sql` y `0002_documentos_gastos.sql` (SQL Editor o `supabase db push`).
2. Copiar `.env.example` a `.env.local` y rellenarlo (las claves secretas solo en servidor).
3. En Supabase > Auth, crear el primer usuario: **será administrador automáticamente**; los siguientes entran como `consulta`.
4. Crear fincas/parcelas/campañas (SQL o Table Editor) y asignar usuarios en `usuarios_fincas`.
5. `npm run dev`

## Cómo se introducen los datos
- **Trabajo y horas, Cosechas y Gastos son de solo consulta** (pantalla con filtros y descarga en Excel/PDF). Los registros se hacen desde el **chat** o adjuntando un documento en el chat (no hay módulo Documentos: el chat lo lee, lo enseña en una tarjeta de revisión y se importa fila a fila). **Cuenta de Resultados** (`/resultados`): se calcula al momento, por finca, con ventas (facturas emitidas), facturas recibidas (clasificadas por la categoría por defecto de su proveedor, cambiable a mano), jornales (partes de trabajo), registros sin factura (nóminas, préstamos, tributos) y los costes generales prorrateados. Filtros por mes, trimestre, año, campaña o rango; comparativa con el año anterior; vista consolidada o por finca; detalle al pulsar un concepto; Excel y PDF. La RLS de Supabase limita cada usuario a sus fincas (vista `v_resultado_lineas` con `security_invoker`). **Facturas por el chat**: se adjuntan (varias a la vez; PDF, foto, Excel o CSV) y la IA lee cada línea: emisor/cliente con NIF, nº y fecha, base, IVA y total. La finca se asigna **por línea** buscando en cada línea (y en su albarán/cabecera) el nombre, código o identificadores de la finca (alias, catastro, dirección, CUPS, contador, matrícula…; Maestros → Lectura de facturas). Es factura recibida (gasto) o emitida (venta) según los NIF de «Mis empresas». Se comprueba que las líneas sumen el total; en Excel/CSV las columnas se detectan solas y se pregunta por las que falten. Nada se importa sin que la persona revise y marque las filas. **Memoria del chat**: las decisiones y reglas estables («los portes de Agrocentro van a Otros gastos») se guardan en una memoria compartida —general o de una finca— que el asistente recibe en cada mensaje y respeta siempre. Las propone el asistente y se confirman con un botón (solo administrador la general; responsables la de sus fincas), o se gestionan en Maestros → Memoria del chat; las bajas quedan en el historial. Las conversaciones de más de 60 mensajes se resumen solas (con Haiku) para no perder lo dicho al principio. **Diario de fincas** (`/diario`): avances, incidencias y avisos que no son parte, gasto ni tarea («el anillado está terminado en Fortaleza») se anotan desde el chat con confirmación y los ven todos los usuarios de esa finca; el asistente los consulta al preguntar «¿cómo va…?». Excel/PDF; retirar deja historial. **Roles**: el encargado introduce la información (partes, cosechas, gastos y facturas, ventas, registros sin factura, tareas y diario) y puede corregirla; anular o borrar, y gestionar maestros, es de responsables y administrador. Un usuario puede tener varias fincas asignadas (p. ej. un encargado de todas) y una finca varios usuarios. **Pruebas con Gemini (gratis)**: con `IA_PROVIDER=gemini` y `GEMINI_API_KEY` en `.env.local` el chat, la lectura de facturas y el resumen de conversaciones usan Gemini mediante un adaptador (`src/lib/ia`); los modelos se eligen con `GEMINI_MODEL_SIMPLE` y `GEMINI_MODEL_COMPLEX`. Sin esas variables se usa Claude. Es solo para pruebas: la calidad con facturas y herramientas no es equivalente. **Costes generales** (personal fijo, amortizaciones, gastos financieros, seguros): solo el administrador, en Maestros → Costes generales. Pueden ser de todas las fincas (se reparten por hectáreas o a partes iguales) o propios de una finca; se devengan por días y se imputan **por campaña** (Excel/PDF). El chat solo los consulta. Las **tareas del calendario** también se crean y se asignan por el chat; las que no tienen día ni semana quedan «pendientes de asignar». Para **corregir o anular** un parte, cosecha o gasto se pide al chat («corrige el parte de ayer», «anula esta cosecha»): enseña el antes y el después, solo cambia al confirmar, comprueba que el registro no haya cambiado entretanto y deja el cambio en el historial. Anular lo pueden hacer solo responsables y administradores.
- **Maestros** (solo administrador): usuarios y fincas asignadas, fincas → parcelas → lotes (opcionales), catálogo de cultivos, personal con costes (tarifa normal / extra / festivo, condiciones propias por trabajador) y festivos.

## Principios de diseño
- La BD es la fuente de verdad; el chat solo cifra con herramientas de consulta.
- El chat **nunca guarda**: crea filas en `acciones_pendientes`; `/api/acciones/[id]` las guarda con la sesión del usuario (RLS) tras pulsar Confirmar.
- RLS en todas las tablas; permisos por rol y finca autorizada. Auditoría por trigger en `audit_log`.
- Presupuestos/estimaciones (`tipo_importe`) nunca se suman a costes reales.

## Estado
- Fase 1 (hecha): esquema completo, auth, chat con confirmación, dashboard, listados de fincas/partes/cosechas.
- Fase 1b (hecha): usuarios, formularios de alta/edición, historial de cambios.
- Fase 2 (hecha): gastos y costes, documentos (subida, lectura con IA, revisión antes de importar, descarga, búsqueda, pendientes de recibir).
- Fase 3 (hecha): calendario con vistas de mes y semana (tareas con día, asignadas a una semana o pendientes sin fecha), informes con exportación a Excel y PDF, objetivos de producción, voz en el chat.

## Avisos
El módulo «Avisos y tareas» se eliminó (y con él los correos automáticos). Las tareas se gestionan en el Calendario y por el chat. Las tablas `avisos` y `avisos_reglas` siguen en la base de datos sin uso.
