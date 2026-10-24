import { holeTotal, isScored } from './scoring';
import type { DuoRule, Hole, HoleScore, Player, PlayerSlot, PlayFormat, Round, RoundMode } from './types';

/**
 * RONDAS
 * Crear una ronda, cargar puntajes y calcular el orden de salida.
 * Todas las funciones devuelven un Round NUEVO en vez de modificar el viejo
 * (inmutabilidad): es lo que espera React/zustand para detectar cambios.
 */

export const MAX_PLAYERS = 12; // permite grupos familiares y de amigos de más de 4 personas
const MAX_KICKS = 30;
const MAX_PENALTIES = 10;

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Genera los 18 hoyos (Ida 1..9 + Vuelta 10..18) a partir de los hoyos de la cancha. */
export function buildEighteenHoles(baseHoles: Hole[]): Hole[] {
  if (baseHoles.length >= 18) return baseHoles.slice(0, 18).map((h, i) => ({ ...h, number: i + 1 }));
  const front = baseHoles.map((h, i) => ({ ...h, number: i + 1 }));
  const back = baseHoles.map((h, i) => ({ ...h, number: front.length + i + 1 }));
  return [...front, ...back].slice(0, 18);
}

/** Extiende una ronda de 9 hoyos (Ida / OUT) agregando la Vuelta (IN, hoyos 10 a 18). */
export function extendRoundWithBackNine(round: Round): Round {
  if (round.holes.length > 9) return { ...round, currentHole: Math.max(10, round.currentHole) };
  const holes = buildEighteenHoles(round.holes);
  return {
    ...round,
    holes,
    currentHole: round.holes.length + 1,
  };
}

export function createRound(
  holes: Hole[],
  courseName: string,
  players: Player[],
  format: PlayFormat,
  options: { demo?: boolean; mode?: RoundMode; duoRule?: DuoRule; createdBy?: string; id?: string } = {},
): Round {
  const mode = options.mode ?? 'individual';
  return {
    id: options.id ?? newId(),
    courseName,
    holes: holes.map((h) => ({ ...h })), // snapshot: copia, no referencia
    players,
    format,
    mode,
    ...(mode === 'duo' ? { duoRule: options.duoRule ?? 'best' } : {}),
    scores: {},
    currentHole: 1,
    startedAt: Date.now(),
    ...(options.createdBy ? { createdBy: options.createdBy } : {}),
    ...(options.demo ? { demo: true } : {}),
  };
}

/** Cantidad exacta de jugadores de un dúo. */
export const DUO_PLAYERS = 2;

/**
 * Convierte los lugares de "Nueva ronda" en jugadores.
 * - Invitado: solo nombre (se descartan los vacíos).
 * - Registrado: lleva el id de su usuario; `accepted` dice si ya confirmó con su contraseña.
 * - Una misma persona registrada no puede jugar dos veces en la misma ronda.
 */
/** Jugador + el permiso de ronda que se usa una sola vez al crear la ronda en el servidor. */
export type PlayerWithToken = Player & { joinToken?: string };

export function buildPlayers(slots: PlayerSlot[]): PlayerWithToken[] {
  const players: PlayerWithToken[] = [];
  const used = new Set<string>();
  for (const slot of slots) {
    if (slot.kind === 'guest') {
      const name = slot.name.trim();
      if (name.length > 0) players.push({ id: newId(), name });
    } else {
      if (used.has(slot.userId)) continue;
      used.add(slot.userId);
      players.push({
        id: newId(),
        name: slot.name,
        profileId: slot.userId,
        accepted: slot.accepted,
        ...(slot.joinToken ? { joinToken: slot.joinToken } : {}),
      });
    }
  }
  return players.slice(0, MAX_PLAYERS);
}

function withScore(
  round: Round,
  playerId: string,
  holeNumber: number,
  score: HoleScore | undefined,
): Round {
  return {
    ...round,
    scores: {
      ...round.scores,
      [playerId]: { ...round.scores[playerId], [holeNumber]: score },
    },
  };
}

/**
 * Suma o resta una patada.
 * Truco de usabilidad: en la primera pulsación de un hoyo vacío el valor salta
 * directo al par (o al par-1 si apretás "−"), porque casi todos los puntajes
 * están cerca del par y así se ahorran toques con el sol en la cara.
 * Si las patadas llegan a 0 se borra el puntaje (sirve como "deshacer").
 */
export function adjustKicks(
  round: Round,
  playerId: string,
  holeNumber: number,
  delta: 1 | -1,
): Round {
  const hole = round.holes.find((h) => h.number === holeNumber);
  if (!hole) return round;

  const current = round.scores[playerId]?.[holeNumber];
  let kicks: number;
  if (!isScored(current)) {
    kicks = delta > 0 ? hole.par : Math.max(1, hole.par - 1);
  } else {
    kicks = Math.min(MAX_KICKS, current.kicks + delta);
  }

  if (kicks <= 0) return withScore(round, playerId, holeNumber, undefined);
  return withScore(round, playerId, holeNumber, {
    kicks,
    penalties: current?.penalties ?? 0,
  });
}

/** Suma o resta una penalización. Solo funciona si el hoyo ya tiene patadas. */
export function adjustPenalties(
  round: Round,
  playerId: string,
  holeNumber: number,
  delta: 1 | -1,
): Round {
  const current = round.scores[playerId]?.[holeNumber];
  if (!isScored(current)) return round;
  const penalties = Math.min(MAX_PENALTIES, Math.max(0, current.penalties + delta));
  return withScore(round, playerId, holeNumber, { ...current, penalties });
}

/** ¿Todos los jugadores cargaron este hoyo? */
export function isHoleComplete(round: Round, holeNumber: number): boolean {
  return round.players.every((p) => isScored(round.scores[p.id]?.[holeNumber]));
}

/** ¿Todos los hoyos están cargados para todos? */
export function isRoundComplete(round: Round): boolean {
  return round.holes.every((h) => isHoleComplete(round, h.number));
}

/**
 * ORDEN DE SALIDA
 * Regla FIFG: en el primer hoyo sale quien se acordó; en los siguientes, sale
 * primero quien hizo mejor puntaje en el hoyo anterior. Si empatan, se
 * mantiene el orden que tenían. (Una vez en el fairway, patea primero el que
 * está más lejos del hoyo: eso lo resuelven los jugadores en la cancha.)
 */
export function teeOrder(round: Round, holeNumber: number): Player[] {
  let order = round.players.map((p) => p.id);

  for (let h = 2; h <= holeNumber; h++) {
    const prev = h - 1;
    const allScored = order.every((id) => isScored(round.scores[id]?.[prev]));
    if (!allScored) continue; // sin datos del hoyo anterior, no se reordena

    order = order
      .map((id, index) => ({
        id,
        index,
        total: holeTotal(round.scores[id]![prev]!),
      }))
      .sort((a, b) => a.total - b.total || a.index - b.index)
      .map((x) => x.id);
  }

  return order.map((id) => round.players.find((p) => p.id === id)!);
}

/**
 * ¿Esta persona puede cargar puntajes en la ronda?
 * Las rondas que solo están en el celular (sin servidor) las edita quien las tiene.
 */
export function canWriteRound(round: Round, userId: string | null | undefined, isAdmin = false): boolean {
  if (!round.remote || round.roundToken) return true;
  if (!userId) return false;
  return isAdmin || round.createdBy === userId || round.players.some((p) => p.profileId === userId && p.accepted);
}

/** El jugador registrado que invitaron a esta ronda pero todavía no aceptó. */
export function pendingPlayerFor(round: Round, userId: string | null | undefined): Player | undefined {
  if (!userId) return undefined;
  return round.players.find((p) => p.profileId === userId && p.accepted === false);
}
