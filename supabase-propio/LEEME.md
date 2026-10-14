# Supabase propio en el PC (sin límite de proyectos)

Instala la versión de código abierto de Supabase con Docker, en este PC. La app de Control de Fincas usa esta base de datos en vez de la nube.
Misma funcionalidad (login, archivos, permisos por finca); los datos **se quedan en la empresa**, y las copias y el mantenimiento los haces tú.

> **Estado:** estos scripts están escritos con el procedimiento oficial de Supabase (versión `self-hosted/v0.8.2`), pero **aún no se han ejecutado de principio a fin**.
> Si algún paso falla, no sigas: copia el mensaje y se corrige.

## Dónde queda todo
| Qué | Dónde |
|---|---|
| Supabase (configuración, claves, datos) | `C:\supabase-campo` — **fuera de OneDrive a propósito** (OneDrive corrompe los ficheros de una base de datos en uso) |
| API y panel (Studio) | `http://<IP-del-PC>:8100` — el 8000 lo usa la app de mantenimiento |
| App de Control de Fincas | `http://<IP-del-PC>:3000` |
| Copias de seguridad | `C:\Backups\SupabaseCampo` |

Requisitos: Docker Desktop, Git, Node.js (ya instalados o en este documento), ~4 GB de RAM libres para Docker y ~10 GB de disco.

## Pasos (en una ventana de PowerShell dentro de esta carpeta)

**0. Docker Desktop.** Instalado con `winget install -e --id Docker.DockerDesktop`. Tras instalarlo puede pedir **reiniciar Windows** (activa WSL2). Después:
abre Docker Desktop, acepta sus condiciones de uso (revisa que la empresa cumple su licencia gratuita: menos de 250 empleados y 10 M$ de ingresos; si no, requiere plan de pago) y espera a que diga *Engine running*.
En Docker Desktop > Settings > General activa **«Start Docker Desktop when you sign in»**.

**1. Instalar y arrancar Supabase**
```powershell
powershell -ExecutionPolicy Bypass -File .\1_instalar.ps1
```
Descarga la configuración oficial, genera contraseñas y claves **nuevas**, cierra el registro público (solo el administrador crea usuarios) y arranca. La primera vez tarda (descarga 2-3 GB).
Al terminar muestra cómo ver las contraseñas del panel y de la base de datos (`run.sh secrets`): **guárdalas fuera de este PC**.

**2. Crear las tablas**
```powershell
powershell -ExecutionPolicy Bypass -File .\2_aplicar_migraciones.ps1
```
Aplica `supabase\migrations\0001…0005` en orden, cada una en una transacción. Se puede repetir sin problema: salta las ya aplicadas.

**3. Crear el administrador** (el primer usuario que se crea es administrador)
```powershell
powershell -ExecutionPolicy Bypass -File .\3_crear_administrador.ps1 -Correo tu@correo.com -Nombre "Tu nombre"
```
Pide la contraseña (mínimo 10 caracteres) sin mostrarla.

**4. Conectar la app**
```powershell
powershell -ExecutionPolicy Bypass -File .\4_configurar_app.ps1
```
Escribe `.env.local` con las claves reales y **desactiva el modo demo**. Conserva `ANTHROPIC_API_KEY` si ya la tenías; si no, ponla a mano en `.env.local`. Después recompila y reinicia la app:
```powershell
cd ..
npm run build
```
y reinicia la tarea `AppCampo` (o cierra y abre `iniciar.bat`).

**5. (Administrador) Red local y copias**
```powershell
.\abrir_firewall.ps1        # permite que móviles y otros equipos lleguen al puerto 8100 (solo redes privadas)
.\instalar_copias.ps1       # copia diaria a las 02:00 y 13:00; opcional: -Extra "\\servidor\copias"
```
Comprueba desde **otro equipo** que la base de datos NO está expuesta: `Test-NetConnection <IP-del-PC> -Port 5432` debe fallar.

## Uso diario
- `iniciar_supabase.bat` / `detener_supabase.bat` (detener **no** borra datos).
- Los contenedores se reinician solos cuando arranca Docker; Docker Desktop arranca al iniciar sesión en Windows. Para un PC que se enciende solo sin que nadie inicie sesión hace falta configurar inicio de sesión automático (o instalar Docker Engine en WSL como servicio).
- Estado y registros: `cd C:\supabase-campo ; docker compose ps` / `docker compose logs <servicio>`.

## Restaurar una copia
1. Detén la app. Descomprime el zip elegido.
2. Copia `env_supabase.txt` como `C:\supabase-campo\.env` (las claves deben ser las originales) y restaura `storage` en `C:\supabase-campo\volumes\storage`.
3. Con Supabase en marcha:
```powershell
docker cp base_de_datos.dump supabase-db:/tmp/restaurar.dump
docker exec supabase-db pg_restore -U supabase_admin -d postgres --clean --if-exists --no-owner /tmp/restaurar.dump
```
Haz una **prueba de restauración** en cuanto tengas datos reales: una copia que nunca se ha restaurado no es una copia fiable.

## Actualizar Supabase
Las versiones `self-hosted/v*` se publican aproximadamente cada mes. Antes de actualizar: haz una copia y lee el *changelog* de Supabase. No cambies imágenes sueltas: solo se prueban en conjunto.

## Seguridad
- `C:\supabase-campo\.env` contiene todas las claves: acceso restringido, nunca a git ni a OneDrive.
- El registro público está cerrado (`DISABLE_SIGNUP=true`). Los usuarios los crea el administrador en la app (Maestros > Usuarios).
- Solo se abre el puerto 8100; el panel Studio pide usuario y contraseña. Si se publica fuera de la red local, hay que ponerlo detrás de HTTPS (la voz del móvil también lo necesita).
