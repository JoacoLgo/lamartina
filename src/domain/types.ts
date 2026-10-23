/**
 * TIPOS DEL DOMINIO
 *
 * Acá se define "qué es" cada cosa en la app. No hay nada de pantallas ni de
 * React: son solo formas de datos. Los comparten la app y el servidor.
 */

/** Formatos de juego (según el reglamento FIFG: stroke play, match play y Stableford). */
export type PlayFormat =
  | 'stroke' //          Medal: gana el que hace menos patadas en total
  | 'stableford' //      Gana el que suma más puntos (premia los buenos hoyos, no castiga el desastre)
  | 'match-golf' //      Match play estilo golf: gana el hoyo quien lo embocó en menos patadas
  | 'match-football'; // Match play estilo fútbol: "ganás un hoyo, hacés un gol"

/** Individual (cada uno por su cuenta) o Dúo (dos personas que juegan como equipo). */
export type RoundMode = 'individual' | 'duo';

/**
 * Cómo se puntúa un dúo:
 *  - best: "mejor pelota": en cada hoyo cuenta el mejor puntaje de los dos.
 *  - sum:  "suma": en cada hoyo se suman las patadas de los dos.
 */
export type DuoRule = 'best' | 'sum';

export interface Hole {
  number: number; // 1..9 o 1..18
  par: number; //    patadas que "debería" necesitar un jugador hábil (lo define la cancha)
  distanceM?: number; // distancia del tee al hoyo, en metros (opcional)
  /** Ideas futuras (todavía no se muestran): consejo "Ayudín" y foto de fondo del hoyo. */
  tip?: string;
  photoKey?: string;
}

/** Perfil de un jugador REGISTRADO (los invitados no tienen perfil). */
export interface Profile {
  id: string;
  name: string;
  nickname?: string;
  createdAt: number;
  /** Marca los perfiles de datos de ejemplo. */
  demo?: boolean;
}

/** Cómo se muestra a una persona: el apodo si tiene, si no el nombre. */
export function displayName(profile: Pick<Profile, 'name' | 'nickname'>): string {
  const nick = profile.nickname?.trim();
  return nick && nick.length > 0 ? nick : profile.name;
}

export interface Player {
  id: string;
  name: string;
  /** Si está, el jugador es REGISTRADO y la ronda puede contar para el ranking. */
  profileId?: string;
  /**
   * Un jugador registrado "acepta" la ronda con su contraseña (o entrando desde su
   * celular). Hasta entonces su resultado no cuenta para el ranking.
   */
  accepted?: boolean;
}

/**
 * Puntaje de UN jugador en UN hoyo.
 * Guardamos las patadas y las penalizaciones por separado (aunque en el
 * reglamento cada penalización cuenta como una patada más) porque así después
 * se pueden sacar estadísticas: "cuántas penalizaciones hacés por ronda".
 */
export interface HoleScore {
  kicks: number;
  penalties: number;
}

/** playerId -> número de hoyo -> puntaje. Un hoyo sin cargar simplemente no existe. */
export type ScoreSheet = Record<string, Record<number, HoleScore | undefined>>;

export interface Round {
  id: string;
  /** Nombre de la cancha al momento de jugar. */
  courseName: string;
  /**
   * Copia ("snapshot") de los hoyos al momento de empezar la ronda.
   * Si el administrador cambia un par después, las rondas viejas no se alteran.
   */
  holes: Hole[];
  players: Player[]; // el orden de este array es el orden de salida en el hoyo 1
  format: PlayFormat;
  mode?: RoundMode; //   si falta, es individual
  duoRule?: DuoRule; //  regla del dúo al momento de jugar
  scores: ScoreSheet;
  currentHole: number;
  startedAt: number;
  finishedAt?: number;
  /** Quién armó la ronda (id de usuario del servidor). */
  createdBy?: string;
  /** Contador de cambios en el servidor (para sincronizar). */
  rev?: number;
  /** ¿Existe en el servidor? Las rondas de invitados sin sesión quedan solo en el celular. */
  remote?: boolean;
  /** Último error al sincronizar con el servidor (solo en el celular). */
  syncError?: string;
  /** Ronda de datos de ejemplo. */
  demo?: boolean;
}

/** Un lugar en la pantalla "Nueva ronda": un invitado o un jugador registrado. */
export type PlayerSlot =
  | { kind: 'guest'; name: string }
  | { kind: 'registered'; userId: string; name: string; accepted: boolean; joinToken?: string };
