import { duoHoleStrokes, duoPairs } from './duo';
import { holeTotal, isScored } from './scoring';
import type { Player, Round } from './types';

/**
 * MATCH PLAY (1 contra 1 individual, o Dúo contra Dúo)
 * No se suman patadas: se compara hoyo por hoyo.
 *  - Estilo golf: gana el hoyo quien necesitó menos patadas; el partido lo
 *    gana quien va arriba por más hoyos de los que quedan ("3&2").
 *  - Estilo fútbol ("win a hole, score a goal"): cada hoyo ganado es un gol y
 *    el resultado final es el marcador, por ejemplo 5 – 3.
 */

export interface MatchStatus {
  format: 'match-golf' | 'match-football';
  a: Player;
  b: Player;
  holesWonA: number;
  holesWonB: number;
  halved: number;
  holesPlayed: number;
  holesRemaining: number;
  /** Quién va ganando, o null si están igualados. */
  leader: 'a' | 'b' | null;
  /** Diferencia de hoyos ganados (en estilo fútbol, diferencia de goles). */
  lead: number;
  /** Estilo golf: el partido ya no se puede dar vuelta. */
  decided: boolean;
  /** Texto listo para mostrar en pantalla. */
  text: string;
}

export function matchStatus(round: Round): MatchStatus | null {
  if (round.format !== 'match-golf' && round.format !== 'match-football') return null;

  let a: Player;
  let b: Player;
  let scoreForSides: (holeNumber: number) => [number, number] | null;

  if (round.mode === 'duo' && round.players.length === 4) {
    const [pairA, pairB] = duoPairs(round.players);
    const rule = round.duoRule ?? 'best';
    a = { id: 'duo-a', name: `${pairA[0].name} y ${pairA[1].name}` };
    b = { id: 'duo-b', name: `${pairB[0].name} y ${pairB[1].name}` };
    scoreForSides = (holeNumber: number) => {
      const a0 = round.scores[pairA[0].id]?.[holeNumber];
      const a1 = round.scores[pairA[1].id]?.[holeNumber];
      const b0 = round.scores[pairB[0].id]?.[holeNumber];
      const b1 = round.scores[pairB[1].id]?.[holeNumber];
      if (!isScored(a0) || !isScored(a1) || !isScored(b0) || !isScored(b1)) return null;
      return [
        duoHoleStrokes(holeTotal(a0), holeTotal(a1), rule),
        duoHoleStrokes(holeTotal(b0), holeTotal(b1), rule),
      ];
    };
  } else {
    if (round.players.length !== 2) return null;
    [a, b] = round.players;
    scoreForSides = (holeNumber: number) => {
      const sa = round.scores[a.id]?.[holeNumber];
      const sb = round.scores[b.id]?.[holeNumber];
      if (!isScored(sa) || !isScored(sb)) return null;
      return [holeTotal(sa), holeTotal(sb)];
    };
  }

  let wonA = 0;
  let wonB = 0;
  let halved = 0;

  for (const hole of round.holes) {
    const pair = scoreForSides(hole.number);
    if (!pair) continue; // el hoyo cuenta cuando ambos lados lo cargaron
    const [ta, tb] = pair;
    if (ta < tb) wonA += 1;
    else if (tb < ta) wonB += 1;
    else halved += 1;
  }

  const holesPlayed = wonA + wonB + halved;
  const holesRemaining = round.holes.length - holesPlayed;
  const lead = Math.abs(wonA - wonB);
  const leader = wonA > wonB ? 'a' : wonB > wonA ? 'b' : null;
  const leaderName = leader === 'a' ? a.name : b.name;

  let decided = false;
  let text: string;

  if (round.format === 'match-football') {
    text =
      holesPlayed === 0 ? 'Sin jugar' : `${a.name} ${wonA} – ${wonB} ${b.name}`;
  } else {
    decided = leader !== null && lead > holesRemaining;
    if (holesPlayed === 0) {
      text = 'Sin jugar';
    } else if (leader === null) {
      text = 'Igualados';
    } else if (holesRemaining === 0) {
      text = `${leaderName} gana por ${lead} ${lead === 1 ? 'hoyo' : 'hoyos'}`; // se jugaron todos los hoyos
    } else if (decided) {
      text = `${leaderName} gana ${lead}&${holesRemaining}`; // ej. "3&2": 3 arriba con 2 por jugar
    } else {
      text = `${leaderName} ${lead} arriba`;
    }
  }

  return {
    format: round.format,
    a,
    b,
    holesWonA: wonA,
    holesWonB: wonB,
    halved,
    holesPlayed,
    holesRemaining,
    leader,
    lead,
    decided,
    text,
  };
}
