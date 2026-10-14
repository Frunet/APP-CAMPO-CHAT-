# Control de Fincas · Fase 1

Next.js 16 + Supabase (Postgres/RLS/Auth/Storage) + Claude API.

## Ver la app sin configurar nada (modo demo)
```bash
echo NEXT_PUBLIC_DEMO=1 > .env.local
npm install
npm run dev
```
Con `NEXT_PUBLIC_DEMO=1` la app no necesita Supabase ni claves: usa datos ficticios en memoria (`src/lib/demo/`), no guarda nada (los formularios responden «Modo demo…»), el chat devuelve respuestas de muestra y la subida de archivos está desactivada. Para desplegarlo en Vercel, importa el repositorio y define esa variable de entorno. **Nunca la actives en producción.**

## Puesta en marcha
1. Crear un proyecto Supabase y ejecutar, en orden, `supabase/migrations/0001_schema.sql` y `0002_documentos_gastos.sql` (SQL Editor o `supabase db push`).
2. Copiar `.env.example` a `.env.local` y rellenarlo (las claves secretas solo en servidor).
3. En Supabase > Auth, crear el primer usuario: **será administrador automáticamente**; los siguientes entran como `consulta`.
4. Crear fincas/parcelas/campañas (SQL o Table Editor) y asignar usuarios en `usuarios_fincas`.
5. `npm run dev`

## Principios de diseño
- La BD es la fuente de verdad; el chat solo cifra con herramientas de consulta.
- El chat **nunca guarda**: crea filas en `acciones_pendientes`; `/api/acciones/[id]` las guarda con la sesión del usuario (RLS) tras pulsar Confirmar.
- RLS en todas las tablas; permisos por rol y finca autorizada. Auditoría por trigger en `audit_log`.
- Presupuestos/estimaciones (`tipo_importe`) nunca se suman a costes reales.

## Estado
- Fase 1 (hecha): esquema completo, auth, chat con confirmación, dashboard, listados de fincas/partes/cosechas.
- Fase 1b (hecha): usuarios, formularios de alta/edición, historial de cambios.
- Fase 2 (hecha): gastos y costes, documentos (subida, lectura con IA, revisión antes de importar, descarga, búsqueda, pendientes de recibir).
- Fase 3 (hecha): avisos automáticos (cron + correo, sin duplicados, leído/resuelto/pospuesto), calendario, informes con exportación a Excel y PDF, objetivos de producción, voz en el chat. Push móvil: arquitectura preparada (`src/lib/avisos/canales.ts`), sin implementar.

## Avisos en segundo plano
`GET /api/cron/avisos` con `Authorization: Bearer $CRON_SECRET` evalúa las reglas y envía los correos (Resend).
- `vercel.json` lo programa cada hora. **El plan Hobby de Vercel solo permite 1 ejecución al día**: con Hobby, cambia el cron a diario o usa pg_cron/otro planificador que llame a esa URL cada hora.
- Sin `RESEND_API_KEY`/`EMAIL_FROM` los avisos se generan en la app y los correos quedan pendientes.
- En Avisos > «Crear reglas recomendadas» se crea el conjunto base.
