import { createRound } from './round';
import type { Hole, Player, Profile, Round } from './types';

/**
 * DATOS DE DEMOSTRACIÓN
 * Sirven para mostrar cómo se ve el ranking sin esperar a que juegue gente
 * (los carga el comando `npm run demo:cargar` del servidor).
 * Es determinístico (mismo resultado siempre): nada de azar real.
 */

export interface DemoPerson {
  id: string;
  username: string;
  name: string;
  nickname: string;
  skill: number; // patadas promedio de más (o de menos) por hoyo respecto al par
}

export const DEMO_PEOPLE: DemoPerson[] = [
  { id: 'demo-1', username: 'demo_tincho', name: 'Martín Gómez', nickname: 'Tincho', skill: 0.15 },
  { id: 'demo-2', username: 'demo_lu', name: 'Lucía Romero', nickname: 'Lu', skill: 0.3 },
  { id: 'demo-3', username: 'demo_nacho', name: 'Ignacio Paz', nickname: 'Nacho', skill: 0.45 },
  { id: 'demo-4', username: 'demo_sofi', name: 'Sofía Molina', nickname: 'Sofi', skill: 0.6 },
  { id: 'demo-5', username: 'demo_tomi', name: 'Tomás Benítez', nickname: 'Tomi', skill: 0.8 },
  { id: 'demo-6', username: 'demo_cande', name: 'Candela Luna', nickname: 'Cande', skill: 1.0 },
  { id: 'demo-7', username: 'demo_fede', name: 'Federico Ruiz', nickname: 'Fede', skill: 0.5 },
  { id: 'demo-8', username: 'demo_vale', name: 'Valentina Sosa', nickname: 'Vale', skill: 0.7 },
];

/** Generador pseudoaleatorio chico (mulberry32): misma semilla, misma secuencia. */
function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemoData(
  holes: Hole[],
  courseName: string,
  now: number = Date.now(),
): { profiles: Profile[]; rounds: Round[] } {
  const rand = rng(2026);
  const DAY = 24 * 60 * 60 * 1000;
  const n = DEMO_PEOPLE.length;

  const profiles: Profile[] = DEMO_PEOPLE.map((p) => ({
    id: p.id,
    name: p.name,
    nickname: p.nickname,
    createdAt: now - 60 * DAY,
    demo: true,
  }));

  const fill = (round: Round, group: number[], players: Player[]) => {
    group.forEach((idx, k) => {
      const sheet: Record<number, { kicks: number; penalties: number }> = {};
      for (const hole of holes) {
        const noise = (rand() + rand() + rand()) / 3 - 0.5; // aprox. entre -0.5 y 0.5
        const delta = Math.round(DEMO_PEOPLE[idx].skill + noise * 2.2);
        sheet[hole.number] = { kicks: Math.max(1, hole.par + delta), penalties: rand() < 0.08 ? 1 : 0 };
      }
      round.scores[players[k].id] = sheet;
    });
  };

  const rounds: Round[] = [];

  // Individuales: cada persona juega varias rondas, en grupos de 2 o 3.
  for (let r = 0; r < 4 * n; r++) {
    const groupSize = 2 + Math.floor(rand() * 2);
    const group = Array.from({ length: groupSize }, (_, k) => (r + k) % n);
    const players: Player[] = group.map((idx) => ({
      id: `demo-p${r}-${idx}`,
      name: DEMO_PEOPLE[idx].nickname,
      profileId: DEMO_PEOPLE[idx].id,
      accepted: true,
    }));
    const round = createRound(holes, courseName, players, r % 2 ? 'stableford' : 'stroke', { demo: true });
    // Algunas rondas son de "hoy" para que se vea la tabla del día.
    round.startedAt = r < 5 ? now - r * 20 * 60 * 1000 - 60 * 60 * 1000 : now - (r + 1) * 2 * DAY;
    round.finishedAt = round.startedAt + 90 * 60 * 1000;
    round.currentHole = holes.length;
    fill(round, group, players);
    rounds.push(round);
  }

  // Dúos: parejas fijas que juegan varias veces.
  const pairs: [number, number][] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3]];
  pairs.forEach(([x, y], pi) => {
    for (let k = 0; k < 3; k++) {
      const players: Player[] = [x, y].map((idx) => ({
        id: `demo-d${pi}-${k}-${idx}`,
        name: DEMO_PEOPLE[idx].nickname,
        profileId: DEMO_PEOPLE[idx].id,
        accepted: true,
      }));
      const round = createRound(holes, courseName, players, 'stroke', { demo: true, mode: 'duo', duoRule: 'best' });
      round.startedAt = now - (pi * 3 + k + 1) * DAY - 5 * 60 * 60 * 1000;
      round.finishedAt = round.startedAt + 100 * 60 * 1000;
      round.currentHole = holes.length;
      fill(round, [x, y], players);
      rounds.push(round);
    }
  });

  // Un hoyo en uno para que se vea esa tabla (Nacho, en una de sus rondas).
  const nachoRound = rounds.find((r) => r.mode !== 'duo' && r.players.some((p) => p.profileId === 'demo-3'));
  if (nachoRound) {
    const nacho = nachoRound.players.find((p) => p.profileId === 'demo-3')!;
    nachoRound.scores[nacho.id][1] = { kicks: 1, penalties: 0 };
  }

  return { profiles, rounds };
}
