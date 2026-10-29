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
- **Ya no hay pantallas de Trabajo, Cosechas, Gastos, Fincas y parcelas, Diario ni Informes**: esos datos se piden **solo por el chat** (cifras, resúmenes y, con «pásame en Excel/PDF…», enlace de descarga con la herramienta `preparar_descarga`). Siguen existiendo Calendario, Cuenta de Resultados, Nóminas y Maestros. Los registros también se hacen desde el chat o adjuntando documentos.
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
