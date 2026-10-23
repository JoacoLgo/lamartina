# La Martina Footgolf — app de la cancha

App de UNA sola cancha (La Martina) para anotar rondas, competir en un ranking y llegar al predio. Funciona en el
navegador (hoy) y está preparada para el celular. Tiene **app** (Expo / React Native) y **servidor** (Node + SQLite) en el mismo proyecto.

## Qué incluye

- **Inicio** con el logo, **mapa arriba a la derecha** ("Cómo llegar"), sesión arriba a la izquierda y un aviso que puede poner el administrador.
- **Cómo llegar**: mapa satelital con la **tranquera**, el **camino** (línea azul) y el **predio** (rojo), y una **guía con el GPS**:
  te dice si estás lejos, cerca de la tranquera, en el camino correcto, si te saliste o si ya llegaste.
- **Cuentas con contraseña**: jugar como **invitado** o con **perfil** (usuario + contraseña + foto opcional). Cerrar sesión, cambiar clave y apodo.
- **Rondas compartidas entre celulares**: se arma la ronda, se busca a los jugadores registrados y cada uno **confirma con su contraseña**
  (o acepta desde su celular). Quien inicia sesión en su celular **cae directo en la misma ronda** y todos ven los mismos puntajes.
  Una persona no puede estar en dos rondas a la vez.
- **Sin señal**: se sigue jugando con la copia del celular; los cambios se envían solos cuando vuelve la conexión.
- **Modos**: stroke play, Stableford, match play (golf y fútbol) y **Dúo** (equipo de dos, con ranking propio).
- **Ranking** (individual y dúo; hoy · este mes · histórico; mejor ronda · promedio · hoyos en uno): tu posición y tus números arriba,
  podio y tabla completa abajo, con foto o iniciales; al tocar una fila se ven sus estadísticas.
- **Administrador**: hoyos y pares, regla del dúo, aviso, datos del lugar, **dibujo del camino/predio sobre el mapa** (incluso grabándolo
  caminando con el GPS), jugadores (restablecer clave, desactivar, dar rol de admin) y rondas (cerrar, sacar del ranking, borrar).

## Cómo correrla (desarrollo)

Hace falta **Node.js LTS** (22.13 o superior). En la terminal de VS Code, dentro de la carpeta:

```powershell
npm install                                          # descarga las librerías
$env:ADMIN_PASSWORD = "una-clave-larga-y-tuya"        # clave del administrador (usuario: admin)
npm run server                                        # TERMINAL 1: el servidor (API + base de datos) en http://localhost:3000
```

Abrí una **segunda terminal** y:

```powershell
npx expo start --web                                  # TERMINAL 2: la app en el navegador
```

En Chrome: `F12` y `Ctrl+Shift+M` (modo celular). Para ver el ranking lleno: `npm run demo:cargar` (usuarios `demo_tincho`, `demo_nacho`…
clave `demo1234`; `npm run demo:quitar` los saca). Para probar el modo compartido, abrí la app en **dos navegadores** (por ejemplo Chrome y
una ventana de incógnito): cada uno es un "celular".

Otros comandos: `npm test` (91 pruebas de lógica y servidor) · `npm run typecheck` · `npm run build:web` (genera `dist` para publicar).
Ponerlo en línea, variables y seguridad: **`server/README.md`**.

## Lo primero que tenés que cargar (desde la app, como administrador)

1. Entrá como `admin` → **Admin → Hoyos**: la cantidad de hoyos, el par y la distancia reales (hoy hay 9 hoyos de ejemplo).
2. **Admin → Lugar**: dibujá el **camino** desde la tranquera hasta el predio y el **contorno del predio** sobre el mapa (o caminándolo con el GPS),
   y completá horarios, contacto y los pasos para ingresar.
3. Cambiá la clave del administrador y creá tu propio perfil de jugador.

## Estructura

```
la-martina-footgolf/
├─ server/                 SERVIDOR (Node + SQLite). Ver server/README.md
│  ├─ app.ts                 todas las rutas de la API
│  ├─ db.ts · auth.ts        base de datos · contraseñas, sesiones y límites de intentos
│  ├─ demo.ts · index.ts     datos de ejemplo · arranque
│  └─ __tests__/             pruebas del servidor
├─ src/
│  ├─ domain/                REGLAS DEL DEPORTE (las usan la app y el servidor, con tests)
│  │  ├─ scoring · round · match · duo · ranking · stats     puntajes, orden de salida, match play, dúos, ranking
│  │  ├─ geo.ts              guía de camino con GPS (distancias, "estás en el camino", "llegaste")
│  │  ├─ sync.ts             cola de envío y combinación de datos entre celulares
│  │  └─ config.ts           validación de lo que carga el administrador
│  ├─ config/                valores iniciales de la cancha (defaults.ts) y capas del mapa (map.ts)
│  ├─ sync/engine.ts         habla con el servidor: sesión, rondas, envío y novedades
│  ├─ store/useAppStore.ts   estado guardado en el dispositivo (sesión, rondas, cola de envío)
│  ├─ lib/                   API, GPS, foto de perfil, compartir, confirmaciones (celular y navegador)
│  ├─ components/            piezas visuales; admin/ = pestañas del panel
│  ├─ theme.ts               colores del logo, tipografía y medidas
│  └─ app/                   PANTALLAS: index · ingresar · registro · perfil · ranking · como-llegar · reglas ·
│                            ronda/nueva · ronda/[id] · ronda/[id]/resumen · admin
├─ docs/                     ROADMAP.md · PUBLICAR.md · INVESTIGACION.md
├─ Dockerfile · docker-compose.yml · .env.example
└─ babel.config.js           evita la pantalla en blanco en el navegador (ver comentario adentro)
```

## Cómo se conecta todo

`pantalla` → cambia el **estado del dispositivo** (`store`, usando funciones puras de `domain`) → si la ronda es compartida, el cambio entra en la
**cola de envío** → el **motor de sincronización** lo manda al **servidor** cada pocos segundos y trae lo que cargaron los demás.
El servidor es quien decide quién puede qué, y calcula el ranking.

## Cosas para confirmar (suposiciones que tomé)

- **Cómo se puntúa el Dúo.** Asumí cada uno con su pelota y, por hoyo, cuenta **la mejor** (mejor pelota). Está la opción **suma** y el
  administrador elige en Admin → Hoyos. Si en la cancha se juega distinto (una sola pelota alternando, por ejemplo), hay que ajustarlo.
- **Quién entra al ranking de dúos:** solo parejas con los dos registrados y confirmados, en rondas completas.
- **Ranking individual:** cuentan rondas completas y terminadas de registrados confirmados; mejor ronda y promedio se miden contra el par
  (el promedio pide 3 rondas).
- **Imágenes satelitales** (Esri) y calles (OpenStreetMap): se usan con atribución visible; revisar sus condiciones antes de una versión comercial
  (`src/config/map.ts`).

## Limitaciones de esta etapa

- El **celular nativo** (Expo Go / tiendas) no se pudo probar: el código de GPS, selector de fotos y el mapa del celular está escrito y revisado por tipos
  pero no ejecutado. El mapa en el celular, por ahora, abre Google Maps; el mapa interactivo con el camino funciona en el navegador.
- En el celular, para hablar con el servidor hay que indicar su dirección (`.env`, ver `.env.example`).
- Todavía no hay historial de rondas en el servidor ("mis rondas" en un celular nuevo): hoy cada celular muestra las rondas que jugó ahí.
