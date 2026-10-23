# Hoja de ruta — La Martina Footgolf

## Estado de lo pedido

| Pedido | Estado |
|---|---|
| App de una sola cancha (La Martina) con su identidad | ✅ |
| Todos los modos de juego (stroke, Stableford, match golf/fútbol) | ✅ |
| **Dúo** con ranking propio | ✅ (regla de puntaje a confirmar: mejor pelota / suma) |
| Mapa arriba a la derecha, **camino de entrada y guía con GPS** | ✅ en el navegador · en el celular abre Google Maps |
| Botón de arriba = **iniciar sesión**; crear perfil aparte | ✅ |
| **Contraseña** en los perfiles; nadie puede alterar un usuario ajeno | ✅ (scrypt, límite de intentos) |
| Sumar jugadores registrados a una ronda con **su contraseña**; ronda compartida entre celulares sin duplicar partidas | ✅ |
| Foto de perfil chica en el ranking | ✅ |
| Ranking con **tu posición y promedio** junto a la tabla completa; períodos (hoy, mes, histórico) | ✅ |
| **Administrador** (hoyos, pares, lugar, camino, jugadores, rondas, aviso) | ✅ |
| Fondo con imagen de cada hoyo | 🕒 pendiente (cada hoyo ya tiene el campo `photoKey`) |
| Cartel «Ayudín 😉» con línea de por dónde patear | 🕒 pendiente (cada hoyo ya guarda su texto en `tip`; el administrador lo puede cargar) |

## Próximos pasos sugeridos

1. **Probar en el celular** (Expo Go con la dirección del servidor en `.env`) y corregir lo que aparezca: es lo único que falta validar.
2. **Poner el servidor en línea con HTTPS** y repartir un QR en la cancha (ver `server/README.md`). Es la forma más barata de lanzar:
   la gente entra desde el navegador y puede «Agregar a pantalla de inicio».
3. **Historial en el servidor** («mis rondas» en cualquier celular) y estadísticas por hoyo.
4. **Temporadas**: cerrar el ranking cada año/torneo y guardar el campeón.
5. **Torneos**: inscripción, tablero en vivo con proyector en el club, premios.
6. **Avisos (notificaciones)** cuando te suman a una ronda o cuando alguien te supera en el ranking.
7. Publicación en tiendas (ver `PUBLICAR.md`) cuando haya presupuesto: ahora además hay que sumar política de privacidad y el borrado de cuenta desde la app.

## Ideas anotadas

**Fotos de cada hoyo de fondo:** una foto por hoyo (desde el tee, en horizontal), guardadas y asociadas por `photoKey`, detrás de la tarjeta
del jugador con un velo oscuro para que el texto se lea.

**«Ayudín 😉»:** sobre la foto del hoyo, un cartel simpático con la sugerencia («tirale a la izquierda del árbol») y una línea dibujada (SVG)
desde el tee hasta la zona recomendada. El texto ya se carga desde Admin → Hoyos; las líneas necesitan un par de coordenadas por hoyo sobre la
foto (un editor como el del camino del mapa).

**Otras:** editar puntajes de rondas viejas · tope de patadas por hoyo (doble par) · desempate por countback · handicap y Stableford neto ·
GPS de distancia al hoyo durante el juego · inglés/portugués · modo oscuro · panel con estadísticas de uso para el club.
