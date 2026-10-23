import { MIN_ROUNDS_FOR_AVERAGE } from './constants';
import { holeTotal, isScored, stablefordPoints } from './scoring';
import type { DuoRule, Player, Profile, Round } from './types';
import { displayName } from './types';

/**
 * DÚOS
 * Dos personas juegan como equipo. En una ronda en modo Dúo puede jugar
 * una pareja (2 jugadores) o varias parejas compitiendo entre sí (4, 6, etc.).
 * Cada persona anota sus patadas y el equipo puntúa según la regla:
 *  - best: mejor pelota (en cada hoyo cuenta el mejor de los dos).
 *  - sum:  suma de los dos.
 */

export interface DuoTotals {
  holesPlayed: number;
  strokes: number;
  parPlayed: number; // en "sum" cuenta el par dos veces (uno por jugador)
  toPar: number;
  points: number; //    puntos Stableford del dúo
  frontStrokes: number;
  backStrokes: number;
}

export interface DuoTeam {
  index: number;
  name: string;
  members: [Player, Player];
  totals: DuoTotals;
  position: number;
  tied: boolean;
}

export function duoHoleStrokes(a: number, b: number, rule: DuoRule): number {
  return rule === 'best' ? Math.min(a, b) : a + b;
}

/** Agrupa la lista de jugadores de una ronda en parejas de a 2 ([0,1], [2,3]...). */
export function duoPairs(players: Player[]): [Player, Player][] {
  const pairs: [Player, Player][] = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    pairs.push([players[i], players[i + 1]]);
  }
  return pairs;
}

export function duoPairTotals(round: Round, pair: [Player, Player], rule: DuoRule = round.duoRule ?? 'best'): DuoTotals {
  const totals: DuoTotals = { holesPlayed: 0, strokes: 0, parPlayed: 0, toPar: 0, points: 0, frontStrokes: 0, backStrokes: 0 };
  const [a, b] = pair;
  for (const hole of round.holes) {
    const sa = round.scores[a.id]?.[hole.number];
    const sb = round.scores[b.id]?.[hole.number];
    if (!isScored(sa) || !isScored(sb)) continue;
    const holeStrokes = duoHoleStrokes(holeTotal(sa), holeTotal(sb), rule);
    const holePar = rule === 'best' ? hole.par : hole.par * 2;
    totals.holesPlayed += 1;
    totals.strokes += holeStrokes;
    totals.parPlayed += holePar;
    totals.points += stablefordPoints(holeStrokes, holePar);
    if (hole.number <= 9) totals.frontStrokes += holeStrokes;
    else totals.backStrokes += holeStrokes;
  }
  totals.toPar = totals.strokes - totals.parPlayed;
  return totals;
}

export function duoTotals(round: Round, rule: DuoRule = round.duoRule ?? 'best'): DuoTotals {
  const pairs = duoPairs(round.players);
  if (pairs.length === 0) return { holesPlayed: 0, strokes: 0, parPlayed: 0, toPar: 0, points: 0, frontStrokes: 0, backStrokes: 0 };
  return duoPairTotals(round, pairs[0], rule);
}

/** Tabla de posiciones por equipos cuando juegan 1 o más dúos en la ronda. */
export function duoLeaderboard(round: Round, rule: DuoRule = round.duoRule ?? 'best'): DuoTeam[] {
  const pairs = duoPairs(round.players);
  const rows = pairs.map((members, index) => ({
    index,
    name: `${members[0].name} y ${members[1].name}`,
    members,
    totals: duoPairTotals(round, members, rule),
  }));
  const key = (r: (typeof rows)[number]) => (round.format === 'stableford' ? -r.totals.points : r.totals.toPar);
  rows.sort((a, b) => key(a) - key(b) || a.index - b.index);
  return rows.map((row) => {
    const first = rows.findIndex((r) => key(r) === key(row));
    const same = rows.filter((r) => key(r) === key(row)).length;
    return { ...row, position: first + 1, tied: same > 1 };
  });
}

export type DuoRankingKind = 'best' | 'average' | 'points';

export interface DuoEntry {
  key: string; //                   ids ordenados de los dos jugadores
  members: [Profile, Profile];
  rounds: number;
  bestStrokes: number;
  bestToPar: number;
  avgToPar: number;
  points: number;
  position: number;
  tied: boolean;
}

/** Puntos estilo AAFG (escala 92%) para una tarjeta terminada respecto al par. */
export function cardPointsFromToPar(toPar: number): number {
  const diff = Math.max(-10, Math.min(30, toPar));
  if (diff <= 0) return Math.round(100 + Math.abs(diff) * 8);
  return Math.max(5, Math.round(100 * Math.pow(0.92, diff)));
}

/**
 * Ranking de dúos: solo cuentan parejas donde LOS DOS están registrados y
 * aceptaron la ronda, y rondas terminadas y completas.
 */
export function buildDuoRanking(
  rounds: Round[],
  profiles: Profile[],
  kind: DuoRankingKind,
  fallbackRule: DuoRule = 'best',
): DuoEntry[] {
  const acc = new Map<string, { members: [Profile, Profile]; rounds: number; best: number; bestStrokes: number; sum: number; cardPoints: number[] }>();

  for (const round of rounds) {
    if (round.mode !== 'duo' || !round.finishedAt || round.players.length < 2) continue;
    const pairs = duoPairs(round.players);
    for (const [a, b] of pairs) {
      if (!a.profileId || !b.profileId || a.accepted === false || b.accepted === false) continue;
      if (a.profileId === b.profileId) continue;
      const pa = profiles.find((p) => p.id === a.profileId);
      const pb = profiles.find((p) => p.id === b.profileId);
      if (!pa || !pb) continue;

      const totals = duoPairTotals(round, [a, b], round.duoRule ?? fallbackRule);
      if (totals.holesPlayed < round.holes.length) continue; // ronda incompleta

      const sorted: [Profile, Profile] = pa.id < pb.id ? [pa, pb] : [pb, pa];
      const key = `${sorted[0].id}+${sorted[1].id}`;
      let e = acc.get(key);
      if (!e) {
        e = { members: sorted, rounds: 0, best: Infinity, bestStrokes: 0, sum: 0, cardPoints: [] };
        acc.set(key, e);
      }
      e.rounds += 1;
      e.sum += totals.toPar;
      e.cardPoints.push(cardPointsFromToPar(totals.toPar));
      if (totals.toPar < e.best) {
        e.best = totals.toPar;
        e.bestStrokes = totals.strokes;
      }
    }
  }

  let entries: DuoEntry[] = [...acc.entries()].map(([key, e]) => {
    const topCards = [...e.cardPoints].sort((a, b) => b - a).slice(0, 6);
    const points = topCards.reduce((s, v) => s + v, 0);
    return {
      key,
      members: e.members,
      rounds: e.rounds,
      bestStrokes: e.bestStrokes,
      bestToPar: e.best,
      avgToPar: e.sum / e.rounds,
      points,
      position: 0,
      tied: false,
    };
  });
  if (kind === 'average') entries = entries.filter((e) => e.rounds >= MIN_ROUNDS_FOR_AVERAGE);

  const value = (e: DuoEntry) => (kind === 'best' ? e.bestToPar : kind === 'points' ? -e.points : Math.round(e.avgToPar * 100));
  entries.sort(
    (x, y) =>
      value(x) - value(y) ||
      y.rounds - x.rounds ||
      displayName(x.members[0]).localeCompare(displayName(y.members[0])),
  );
  return entries.map((e) => {
    const first = entries.findIndex((o) => value(o) === value(e));
    const same = entries.filter((o) => value(o) === value(e)).length;
    return { ...e, position: first + 1, tied: same > 1 };
  });
}
