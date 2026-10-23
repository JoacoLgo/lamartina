import type { HoleScore, Player, Round } from './types';

/**
 * PUNTAJES
 * Funciones puras: reciben datos, devuelven datos. No tocan pantalla ni
 * almacenamiento, por eso se pueden probar solas (ver src/domain/__tests__).
 */

/** Total de un hoyo: cada penalización cuenta como una patada más. */
export function holeTotal(score: HoleScore): number {
  return score.kicks + score.penalties;
}

/** Un hoyo está "cargado" cuando tiene al menos una patada. */
export function isScored(score: HoleScore | undefined): score is HoleScore {
  return score !== undefined && score.kicks > 0;
}

export type ScoreName =
  | 'hole-in-one'
  | 'albatross'
  | 'eagle'
  | 'birdie'
  | 'par'
  | 'bogey'
  | 'double-bogey'
  | 'worse';

export function scoreName(total: number, par: number): ScoreName {
  if (total === 1) return 'hole-in-one';
  const diff = total - par;
  if (diff <= -3) return 'albatross';
  if (diff === -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  if (diff === 2) return 'double-bogey';
  return 'worse';
}

export const SCORE_NAME_ES: Record<ScoreName, string> = {
  'hole-in-one': 'Hoyo en uno',
  albatross: 'Albatros',
  eagle: 'Águila',
  birdie: 'Birdie',
  par: 'Par',
  bogey: 'Bogey',
  'double-bogey': 'Doble bogey',
  worse: 'Más de doble bogey',
};

/**
 * Forma con la que las tarjetas de golf marcan el número:
 * círculo = mejor que el par, cuadrado = peor que el par.
 */
export type ScoreShape = 'double-circle' | 'circle' | 'none' | 'square' | 'double-square';

export function scoreShape(total: number, par: number): ScoreShape {
  const diff = total - par;
  if (total === 1 || diff <= -2) return 'double-circle';
  if (diff === -1) return 'circle';
  if (diff === 0) return 'none';
  if (diff === 1) return 'square';
  return 'double-square';
}

/**
 * Stableford (bruto): par = 2 puntos, birdie = 3, águila = 4, bogey = 1,
 * doble bogey o peor = 0. Nunca da negativo.
 */
export function stablefordPoints(total: number, par: number): number {
  return Math.max(0, 2 + par - total);
}

export interface PlayerTotals {
  holesPlayed: number;
  strokes: number; //    patadas totales (incluye penalizaciones)
  parPlayed: number; //  suma del par de los hoyos ya jugados
  toPar: number; //      strokes - parPlayed (negativo = bajo el par)
  points: number; //     puntos Stableford
  penalties: number;
  frontStrokes: number; // Ida (OUT: hoyos 1..9)
  frontPar: number;
  backStrokes: number; //  Vuelta (IN: hoyos 10..18)
  backPar: number;
}

export function playerTotals(round: Round, playerId: string): PlayerTotals {
  const totals: PlayerTotals = {
    holesPlayed: 0,
    strokes: 0,
    parPlayed: 0,
    toPar: 0,
    points: 0,
    penalties: 0,
    frontStrokes: 0,
    frontPar: 0,
    backStrokes: 0,
    backPar: 0,
  };
  for (const hole of round.holes) {
    const score = round.scores[playerId]?.[hole.number];
    if (!isScored(score)) continue;
    const total = holeTotal(score);
    totals.holesPlayed += 1;
    totals.strokes += total;
    totals.parPlayed += hole.par;
    totals.points += stablefordPoints(total, hole.par);
    totals.penalties += score.penalties;
    if (hole.number <= 9) {
      totals.frontStrokes += total;
      totals.frontPar += hole.par;
    } else {
      totals.backStrokes += total;
      totals.backPar += hole.par;
    }
  }
  totals.toPar = totals.strokes - totals.parPlayed;
  return totals;
}

/**
 * Desempate oficial FIFG ("Countback"):
 * Compara últimos 9 hoyos (Vuelta / IN), últimos 6, últimos 3 y último hoyo.
 */
export function countbackCompare(round: Round, playerA: string, playerB: string): number {
  const n = round.holes.length;
  const windows = [9, 6, 3, 1].filter((w) => w <= n);
  for (const w of windows) {
    const slice = round.holes.slice(n - w);
    let toParA = 0;
    let toParB = 0;
    let complete = true;
    for (const h of slice) {
      const sa = round.scores[playerA]?.[h.number];
      const sb = round.scores[playerB]?.[h.number];
      if (!isScored(sa) || !isScored(sb)) {
        complete = false;
        break;
      }
      toParA += holeTotal(sa) - h.par;
      toParB += holeTotal(sb) - h.par;
    }
    if (complete && toParA !== toParB) {
      return round.format === 'stableford' ? toParB - toParA : toParA - toParB;
    }
  }
  return 0;
}

export interface LeaderboardRow {
  player: Player;
  totals: PlayerTotals;
  position: number; // 1 = primero. Los empatados comparten posición.
  tied: boolean;
}

/**
 * Tabla de posiciones.
 * - Stableford: más puntos primero.
 * - Resto de formatos: menos patadas respecto al par primero (comparamos contra
 *   el par y no contra el total, así una ronda a medias no queda "ganando").
 *
 * Ojo: no desempata por "countback" (últimos 9, 6, 3 hoyos…). Es una mejora
 * pendiente para torneos.
 */
export function leaderboard(round: Round): LeaderboardRow[] {
  const rows = round.players.map((player, index) => ({
    player,
    index,
    totals: playerTotals(round, player.id),
  }));

  const key = (r: (typeof rows)[number]) =>
    round.format === 'stableford' ? -r.totals.points : r.totals.toPar;

  rows.sort((a, b) => key(a) - key(b) || countbackCompare(round, a.player.id, b.player.id) || a.index - b.index);

  return rows.map((row) => {
    const firstWithSameKey = rows.findIndex((r) => key(r) === key(row));
    const sameCount = rows.filter((r) => key(r) === key(row)).length;
    return {
      player: row.player,
      totals: row.totals,
      position: firstWithSameKey + 1,
      tied: sameCount > 1,
    };
  });
}

/** Formatea toPar: 0 -> "E" (even), 3 -> "+3", -2 -> "-2". */
export function formatToPar(toPar: number): string {
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}
