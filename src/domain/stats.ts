import { duoLeaderboard, duoTotals } from './duo';
import { matchStatus } from './match';
import {
  formatToPar,
  holeTotal,
  isScored,
  leaderboard,
  scoreName,
  type ScoreName,
} from './scoring';
import type { Hole, Round } from './types';

/**
 * ESTADÍSTICAS Y RESUMEN
 */

export interface PlayerStats {
  counts: Record<ScoreName, number>;
  penalties: number;
  frontStrokes: number; //  patadas en los hoyos 1 a 9
  backStrokes: number; //   patadas en los hoyos 10 a 18
  averagePerHole: number; // 0 si todavía no jugó ningún hoyo
}

export function playerStats(round: Round, playerId: string): PlayerStats {
  const counts: Record<ScoreName, number> = {
    'hole-in-one': 0,
    albatross: 0,
    eagle: 0,
    birdie: 0,
    par: 0,
    bogey: 0,
    'double-bogey': 0,
    worse: 0,
  };
  let penalties = 0;
  let front = 0;
  let back = 0;
  let played = 0;
  let strokes = 0;

  for (const hole of round.holes) {
    const s = round.scores[playerId]?.[hole.number];
    if (!isScored(s)) continue;
    const total = holeTotal(s);
    counts[scoreName(total, hole.par)] += 1;
    penalties += s.penalties;
    strokes += total;
    played += 1;
    if (hole.number <= 9) front += total;
    else back += total;
  }

  return {
    counts,
    penalties,
    frontStrokes: front,
    backStrokes: back,
    averagePerHole: played === 0 ? 0 : strokes / played,
  };
}

/** Helpers de cancha */

export function defaultHoles(count: 9 | 18): Hole[] {
  return Array.from({ length: count }, (_, i) => ({ number: i + 1, par: 3 }));
}

export function courseParTotal(holes: Hole[]): number {
  return holes.reduce((sum, h) => sum + h.par, 0);
}

/** Texto del equipo de un dúo: "Tincho y Nacho: -2". */
export function duoText(round: Round): string {
  const match = matchStatus(round);
  if (match && round.players.length === 4) return match.text;
  const teams = duoLeaderboard(round);
  if (teams.length <= 1) {
    const names = round.players.map((p) => p.name).join(' y ');
    const t = duoTotals(round);
    if (t.holesPlayed === 0) return `Dúo ${names}`;
    return round.format === 'stableford' ? `${names}: ${t.points} pts` : `${names}: ${formatToPar(t.toPar)}`;
  }
  return teams
    .map((t) =>
      t.totals.holesPlayed === 0
        ? t.name
        : round.format === 'stableford'
          ? `${t.name} ${t.totals.points} pts`
          : `${t.name} ${formatToPar(t.totals.toPar)}`,
    )
    .join(' · ');
}

/** Texto plano para compartir por WhatsApp, etc. */
export function roundSummaryText(round: Round): string {
  const date = new Date(round.startedAt).toLocaleDateString('es-AR');
  const lines: string[] = [`Footgolf en ${round.courseName} – ${date}`];

  const match = matchStatus(round);
  if (match) lines.push(match.text);
  if (round.mode === 'duo') lines.push(`Dúo (${round.duoRule === 'sum' ? 'suma' : 'mejor pelota'}): ${duoText(round)}`);

  for (const row of leaderboard(round)) {
    const t = row.totals;
    const medal = row.tied ? `${row.position}º (empate)` : `${row.position}º`;
    lines.push(
      round.format === 'stableford'
        ? `${medal} ${row.player.name}: ${t.points} pts (${t.strokes} patadas)`
        : `${medal} ${row.player.name}: ${t.strokes} patadas (${formatToPar(t.toPar)})`,
    );
  }
  return lines.join('\n');
}

/** Línea corta con cómo va la ronda (para el historial y la cabecera del hoyo). */
export function standingsText(round: Round): string {
  if (round.mode === 'duo') return duoText(round);
  const match = matchStatus(round);
  if (match) return match.text;
  return leaderboard(round)
    .map((r) =>
      round.format === 'stableford'
        ? `${r.player.name} ${r.totals.points} pts`
        : `${r.player.name} ${formatToPar(r.totals.toPar)}`,
    )
    .join(', ');
}
