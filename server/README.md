# Servidor de La Martina Footgolf

Es el "cerebro compartido": guarda los usuarios (con contraseña), las rondas que se juegan entre varios celulares,
el ranking, la configuración de la cancha (hoyos, pares, mapa) y lo que carga el administrador.
Sin librerías externas: usa solo Node y su base de datos SQLite incluida (`node:sqlite`, hace falta Node 22.13 o superior).

## Cómo arrancarlo (desarrollo)

```powershell
npm install
$env:ADMIN_PASSWORD = "una-clave-larga-y-tuya"     # PowerShell (Windows). En Linux/Mac: export ADMIN_PASSWORD=...
npm run server                                      # queda escuchando en http://localhost:3000
```

La primera vez crea el usuario administrador (`admin`, con la clave que pusiste). La base de datos se guarda en
`data/footgolf.db`. Para ver el ranking lleno: `npm run demo:cargar` (y `npm run demo:quitar` para sacar esos datos).

## Variables de entorno

| Variable | Para qué sirve | Por defecto |
|---|---|---|
| `ADMIN_PASSWORD` | Clave del administrador inicial (se crea al arrancar si todavía no hay uno) | — |
| `ADMIN_USER` | Usuario del administrador inicial | `admin` |
| `ADMIN_RESET=1` | Pisa la clave del administrador con `ADMIN_PASSWORD` (si se olvidó). Usarlo una vez y sacarlo | — |
| `PORT` | Puerto | `3000` |
| `DB_PATH` | Archivo de la base de datos | `data/footgolf.db` |
| `STATIC_DIR` | Carpeta con la app web (`npm run build:web` → `dist`). Si se define, el servidor también sirve la app | — |
| `CORS_ORIGIN` | Dominio autorizado a usar la API desde un navegador | `*` |
| `TRUST_PROXY=1` | Detrás de nginx/Caddy/Cloudflare: usar la IP real del visitante (para limitar intentos) | — |
| `SECRET` | Clave para firmar los "permisos de ronda" (si falta se genera sola en cada arranque) | al azar |
| `UTC_OFFSET_MINUTES` | Diferencia horaria del club (define cuándo empieza "hoy") | `-180` (Argentina) |

## Ponerlo en línea (para que lo use la gente de la cancha)

1. `npm run build:web` genera la app web en la carpeta `dist`.
2. Corré el servidor con `STATIC_DIR=dist`: **una sola dirección** sirve la app y la API (no hace falta configurar nada más en la app).
3. **Tiene que ser HTTPS.** Sin HTTPS el navegador bloquea el GPS y las contraseñas viajarían sin cifrar. Opciones habituales:
   un proxy inverso (Caddy o nginx con Let's Encrypt) o un túnel (por ejemplo Cloudflare Tunnel, que además evita abrir puertos en el
   router; verificar sus condiciones vigentes).
4. Hay un `Dockerfile` y un `docker-compose.yml` en la raíz del proyecto (no se pudieron probar con Docker en el entorno donde se
   escribieron; el servidor aislado sí se probó con Node).
5. **Respaldo:** la base es un solo archivo (`data/footgolf.db`, más `-wal` y `-shm` mientras corre). Copiala con el servidor
   apagado, o con `sqlite3 data/footgolf.db ".backup 'respaldo.db'"` si tenés la herramienta `sqlite3`. Programá una copia diaria.

## Qué se hizo para cuidar las cuentas (y qué falta)

Hecho:
- Contraseñas con **scrypt** y sal propia por usuario; nunca se guardan ni se devuelven. La comparación es en tiempo constante.
- Sesiones con un token al azar de 256 bits; en la base solo queda su hash. Duran 90 días y se cierran al cambiar o restablecer la contraseña.
- **Límite de intentos**: 8 fallos cada 10 minutos por usuario+IP en el ingreso y en la confirmación de contraseñas ajenas; 30 registros por hora por IP.
- El "permiso de ronda" (cuando alguien confirma su clave en el celular de otro) es una firma de 10 minutos atada a esa persona: la clave viaja una sola vez y no se guarda.
- Validación estricta de todo lo que llega (tipos, rangos, largos); puntajes, jugadores y pares los controla el servidor (un celular no puede inventar el par de un hoyo para mejorar su resultado).
- Fotos: solo JPG/PNG/WebP, máximo 150 KB, verificando que el contenido sea realmente una imagen, y servidas con `nosniff`.
- Permisos por ronda (solo participantes confirmados escriben) y por rol (todo lo de `/api/admin` exige ser administrador).
- Un jugador no puede estar en dos rondas activas a la vez.

Limitaciones a tener en cuenta:
- Sin correo electrónico no hay "olvidé mi contraseña" automático: el administrador la restablece desde la app (Admin → Jugadores).
- El límite de intentos vive en la memoria del servidor (se reinicia al reiniciar). Para un club alcanza; con mucho tráfico conviene sumar un limitador en el proxy.
- Sin segundo factor de autenticación.
- El token de sesión se guarda en el almacenamiento del navegador/celular (práctica habitual, pero un fallo de seguridad de tipo XSS podría robarlo; la app no muestra HTML de terceros).
- Datos personales (nombre, foto, resultados): conviene publicar una política de privacidad y avisar qué se guarda. La ubicación del GPS se usa solo en el
  celular para guiar y no se envía ni se guarda. (Esto no es asesoramiento legal.)

## Pruebas

`npm test` corre las pruebas de la lógica y las del servidor (cuentas, rondas compartidas, dúos, ranking, administrador y permisos).
