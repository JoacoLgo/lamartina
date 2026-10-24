import { MIN_ROUNDS_FOR_AVERAGE } from './constants';
import { cardPointsFromToPar } from './duo';
import { playerStats } from './stats';
import { isScored, playerTotals } from './scoring';
import type { Profile, Round } from './types';

/**
 * RANKING DE LA CANCHA (CLUB Y SISTEMA PROFESIONAL FIFG / AAFG)
 *
 * Reglas:
 *  - Solo cuentan jugadores REGISTRADOS (los invitados no aparecen).
 *  - Solo cuentan rondas TERMINADAS y COMPLETAS (el jugador cargó todos los hoyos):
 *    así nadie "gana" una ronda a medias.
 *  - Se mide contra el par de cada hoyo, no contra el total de patadas.
 *
 * Cuatro tablas:
 *  - points:  Sistema de Puntos Profesional (estilo AAFG 92% / FIFG): cada tarjeta
 *             completa suma puntos según la escala del 92% y la posición lograda,
 *             computando las mejores 6 tarjetas del jugador.
 *  - best:    la mejor ronda de cada jugador (menos patadas respecto al par).
 *  - average: el promedio respecto al par; pide un mínimo de rondas para evitar
 *             que una única ronda afortunada deje a alguien primero.
 *  - aces:    cantidad de hoyos en uno.
 */

export type RankingKind = 'best' | 'average' | 'points' | 'aces';

export { MIN_ROUNDS_FOR_AVERAGE };

export const MAX_COUNTED_CARDS = 6; // estilo AAFG: suman las mejores N tarjetas del jugador

export interface RankingEntry {
  profile: Profile;
  rounds: number; //        rondas completas
  bestStrokes: number; //   patadas de su mejor ronda
  bestToPar: number; //     su mejor ronda respecto al par
  avgToPar: number; //      promedio respecto al par
  points: number; //        puntos acumulados (sistema AAFG 92%, mejores tarjetas)
  aces: number;
  position: number;
  tied: boolean;
}

interface Accumulator {
  profile: Profile;
  rounds: number;
  bestToPar: number;
  bestStrokes: number;
  sumToPar: number;
  cardPoints: number[];
  aces: number;
}

function key(entry: RankingEntry, kind: RankingKind): number {
  if (kind === 'best') return entry.bestToPar;
  if (kind === 'average') return Math.round(entry.avgToPar * 100); // evita falsos desempates por decimales
  if (kind === 'points') return -entry.points;
  return -entry.aces;
}

export function buildRanking(
  rounds: Round[],
  profiles: Profile[],
  kind: RankingKind,
): RankingEntry[] {
  const acc = new Map<string, Accumulator>();

  for (const round of rounds) {
    if (!round.finishedAt || round.mode === 'duo') continue; // los dúos tienen su propio ranking

    // Clasificación dentro de esta ronda para otorgar bono competitivo 92% si jugaron varios
    const validInRound: { profileId: string; toPar: number }[] = [];

    for (const player of round.players) {
      if (!player.profileId || player.accepted === false) continue; // sin aceptar: no cuenta
      const profile = profiles.find((p) => p.id === player.profileId);
      if (!profile) continue;

      let a = acc.get(profile.id);
      if (!a) {
        a = { profile, rounds: 0, bestToPar: Infinity, bestStrokes: 0, sumToPar: 0, cardPoints: [], aces: 0 };
        acc.set(profile.id, a);
      }

      // Los hoyos en uno cuentan aunque la ronda esté incompleta.
      a.aces += playerStats(round, player.id).counts['hole-in-one'];

      const totals = playerTotals(round, player.id);
      const fullComplete = totals.holesPlayed === round.holes.length;
      const frontComplete =
        round.holes.length > 9 &&
        round.holes.filter((h) => h.number <= 9).every((h) => isScored(round.scores[player.id]?.[h.number]));

      if (!fullComplete && !frontComplete) continue; // ni la ronda entera ni la Ida (9 hoyos) están completas

      const effectiveStrokes = fullComplete ? totals.strokes : totals.frontStrokes;
      const effectiveToPar = fullComplete ? totals.toPar : totals.frontStrokes - totals.frontPar;

      a.rounds += 1;
      a.sumToPar += effectiveToPar;
      if (effectiveToPar < a.bestToPar) {
        a.bestToPar = effectiveToPar;
        a.bestStrokes = effectiveStrokes;
      }
      validInRound.push({ profileId: profile.id, toPar: effectiveToPar });
    }

    if (validInRound.length > 0) {
      validInRound.sort((x, y) => x.toPar - y.toPar);
      validInRound.forEach((v, idx) => {
        const firstIdx = validInRound.findIndex((o) => o.toPar === v.toPar);
        const basePts = cardPointsFromToPar(v.toPar);
        // Si compitieron 2 o más registrados en la misma partida, aplica escala 92% por puesto
        const placementBonus = validInRound.length >= 2 ? Math.round(25 * Math.pow(0.92, firstIdx)) : 0;
        const a = acc.get(v.profileId);
        if (a) a.cardPoints.push(basePts + placementBonus);
      });
    }
  }

  let entries: RankingEntry[] = [...acc.values()].map((a) => {
    const topCards = [...a.cardPoints].sort((x, y) => y - x).slice(0, MAX_COUNTED_CARDS);
    const points = topCards.reduce((sum, p) => sum + p, 0);
    return {
      profile: a.profile,
      rounds: a.rounds,
      bestStrokes: a.bestStrokes,
      bestToPar: a.bestToPar,
      avgToPar: a.rounds === 0 ? 0 : a.sumToPar / a.rounds,
      points,
      aces: a.aces,
      position: 0,
      tied: false,
    };
  });

  // Quién entra a cada tabla
  if (kind === 'best' || kind === 'points') entries = entries.filter((e) => e.rounds >= 1);
  if (kind === 'average') entries = entries.filter((e) => e.rounds >= MIN_ROUNDS_FOR_AVERAGE);
  if (kind === 'aces') entries = entries.filter((e) => e.aces >= 1);

  entries.sort(
    (x, y) =>
      key(x, kind) - key(y, kind) ||
      y.rounds - x.rounds || //     a igualdad, el que jugó más rondas
      x.profile.name.localeCompare(y.profile.name),
  );

  return entries.map((e) => {
    const first = entries.findIndex((o) => key(o, kind) === key(e, kind));
    const same = entries.filter((o) => key(o, kind) === key(e, kind)).length;
    return { ...e, position: first + 1, tied: same > 1 };
  });
}

/** Posición de un perfil en una tabla (o null si todavía no clasifica). */
export function positionOf(entries: RankingEntry[], profileId: string): number | null {
  return entries.find((e) => e.profile.id === profileId)?.position ?? null;
}
