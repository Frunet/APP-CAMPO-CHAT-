# Datos Frunet en ChatGPT

Conector MCP privado de solo lectura. Consulta horas, extras, trabajos realizados, personal activo y calendario (pendientes y completadas). Los costes de mano de obra solo están disponibles para administrador y responsables, como en la app. No hay acceso a tarifas, facturas, secretos ni herramientas de modificación.

## Componentes

- Migración `0033_chatgpt_consulta_limitada.sql`: las sesiones OAuth no heredan los permisos normales de la app ni acceso directo a tablas. Una función de consulta devuelve únicamente los campos autorizados y las fincas del usuario.
- Función Edge `datos-frunet`: protocolo MCP, validación de sesión con Supabase Auth y cinco herramientas de lectura. Desplegar con la verificación antigua del gateway desactivada: el código valida cada token con `auth.getUser` antes de atender consultas. La metadata OAuth es pública y no contiene datos.
- Pantalla de autorización de la web: detecta `authorization_id` en la URL y conserva la solicitud al iniciar sesión. Solo permite aprobar destinos HTTPS de ChatGPT/OpenAI.
- `chatgpt/plugin/`: paquete privado, sin claves, tokens ni contraseñas. Comprimir su contenido y subir desde ChatGPT → Complementos → Añadir → Subir archivo comprimido.

## Configuración del proyecto

Activar Supabase Auth OAuth Server y registro dinámico para que ChatGPT registre su cliente. Configurar Site URL como `https://frunet.github.io/APP-CAMPO-CHAT-` y Authorization Path `/`; verificar la URL resultante de la pantalla. No se requiere autorización administrativa de la organización ni un token de administración de Supabase.

Servidor: `https://rnsoeznosqoetxtcwdzk.supabase.co/functions/v1/datos-frunet`.

Conectar mediante OAuth, iniciar sesión con un usuario de la app de campo y revisar la autorización. El alcance de los datos lo controla el rol de ese usuario. El administrador ve todas las fincas; los demás perfiles ven las autorizadas y sus tareas. El calendario filtra por fecha/semana y estado. Las consultas se limitan a 366 días; partes y calendario devuelven hasta 300 filas y debe acortarse el periodo si se alcanza ese límite. Los costes conocidos pueden ser parciales: se informa cuántos partes carecen de coste.

## Comprobaciones

`node --experimental-strip-types --test supabase/tests/chatgpt-protocolo.test.ts`

En una base aislada con las migraciones aplicadas: ejecutar `supabase/tests/chatgpt_limitado.sql` y `supabase/tests/operativa_extras_personal.sql`. Ambas pruebas revierten sus datos. Nunca ejecutar las semillas de pruebas en producción.

## Ejemplos

- Compara las horas de PAI, FRUNET y LOMAS del 3 al 7 de noviembre de 2026.
- Qué trabajos se realizaron ayer en PAI y cuántas horas se dedicaron.
- Qué tareas del calendario están pendientes esta semana.
- Cuál es el coste de mano de obra de noviembre por finca; indica los importes que falten.

La API anterior `consulta-horas` y su clave siguen siendo independientes. Sus datos económicos permanecen desactivados; el permiso nuevo de costes corresponde solo a este conector autenticado por usuario.
