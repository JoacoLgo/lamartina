# Investigación: cómo son las mejores apps y qué reglas tiene el footgolf

## 1. Qué hay en el mercado

**Apps de golf (las más desarrolladas):** Golf Pad, 18Birdies, Golfshot, Hole19, SwingU, TheGrint.
Funciones en común: GPS con distancias a green/obstáculos, tarjeta digital para hasta 4 jugadores,
estadísticas por ronda, handicap, componente social (seguir rondas de amigos), versión para reloj y modo
de bajo consumo de batería. Dos aprendizajes de las reseñas: la **batería** importa mucho, y los
usuarios valoran que la tarjeta y las distancias estén en la **misma pantalla**.

**Apps de footgolf (pocas y simples):**
- *FIFG FootGolf* (federación internacional): check-in a torneos, tarjeta digital, leaderboards y
  parejas, buscador de canchas, noticias.
- *FootGolf World Cup* (EE.UU./Canadá): torneos, posiciones de temporada, tarjeta en el teléfono.
- *Footgolf Tech* (Brasil): equipos y clubes, tarjeta online para campeonatos.
- *FootGolf Parc* (Francia): tarjeta de 2 canchas puntuales, nombres de jugadores, acumulado, partidas guardadas.
- Apps genéricas de tarjeta (mini golf / disc golf) que algunos usan para footgolf.

**Conclusión:** no encontré una app completa y moderna de footgolf (puntajes + GPS + estadísticas +
torneos). Hay lugar para una. (No busqué específicamente apps argentinas: vale la pena mirar qué usan
en tu cancha y en la federación local.)

## 2. Reglas que condicionan la lógica (FIFG)

- Se juega con pelota de fútbol Nº 5; gana quien emboca en menos patadas.
- **El par lo define cada cancha** (por eso la app no lo calcula: lo carga el usuario por hoyo). Orientativo:
  par 3 suele ser 50–100 m, par 4 100–200 m, par 5 más largo.
- Formatos: **stroke play**, **match play estilo golf** (hoyo ganado/empatado) y **match play estilo
  fútbol** ("ganás un hoyo, hacés un gol"). El reglamento menciona además Stableford, bogey y par.
- **Orden de salida:** en cada hoyo sale primero quien mejor puntuó en el anterior; ya en el fairway
  patea primero el más lejano al hoyo.
- **Penalizaciones:** agua, fuera de límites, no marcar la pelota cuando otra la golpea, etc. Los
  detalles **varían entre reglamento FIFG, federaciones y reglas locales** (una fuente cuenta 1 patada de
  penalización y otra 2 por patear la pelota ajena). Por eso la app las maneja como un *contador*
  (sumás las que correspondan) y no las impone.
- Grupos de hasta 4 jugadores.

Reglamento oficial: https://www.footgolf.sport/footgolf-rules/

## 3. Funciones: qué incluye esta versión y qué sigue

**Incluido (v1):** canchas propias · 1–4 jugadores · stroke / Stableford / match golf / match fútbol ·
penalizaciones · orden de salida automático · tarjeta con círculos y cuadrados · estadísticas ·
historial · compartir resultado · 100 % offline.

**Siguiente (v1.1):** editar puntajes y canchas después de guardar · jugadores frecuentes guardados ·
tope de patadas por hoyo (doble par) · desempate por countback · Stableford neto con handicap ·
inglés/portugués · modo oscuro.

**Después (v2):** GPS (distancia al hoyo; guardar coordenadas por hoyo) · cuentas de usuario y
sincronización en la nube (Supabase) · torneos con leaderboard en vivo y check-in · buscador de canchas
con mapa · evolución de estadísticas en el tiempo · reloj.

Nota de privacidad: apenas agregues cuentas, GPS o nube, cambian los formularios de privacidad de
las tiendas (ver PUBLICAR.md).
