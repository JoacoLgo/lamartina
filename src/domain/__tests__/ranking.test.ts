import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDemoData } from '../demo';
import { MIN_ROUNDS_FOR_AVERAGE, buildRanking, positionOf } from '../ranking';
import { adjustKicks, buildPlayers, createRound, extendRoundWithBackNine, newId } from '../round';
import { defaultHoles } from '../stats';
import type { Profile, Round } from '../types';

const holes = defaultHoles(9);
const ana: Profile = { id: 'pa', name: 'Ana Pérez', nickname: 'Ani', createdAt: 0 };
const beto: Profile = { id: 'pb', name: 'Beto Díaz', createdAt: 0 };
const profiles = [ana, beto];

/** Ronda terminada donde cada jugador hace `kicksPerHole[i]` patadas en todos los hoyos. */
function finishedRound(
  entries: { profile?: Profile; name?: string; kicks: number; skipHoles?: number[] }[],
): Round {
  const players = entries.map((e) => ({
    id: newId(),
    name: e.profile?.name ?? e.name ?? 'Invitado',
    profileId: e.profile?.id,
    ...(e.profile ? { accepted: true } : {}),
  }));
  let round = createRound(holes, 'Cancha de prueba', players, 'stroke');
  entries.forEach((e, i) => {
    for (const h of holes) {
      if (e.skipHoles?.includes(h.number)) continue;
      // primer toque deja el par (3); después sumamos o restamos hasta llegar a e.kicks
      round = adjustKicks(round, players[i].id, h.number, 1);
      while (round.scores[players[i].id][h.number]!.kicks < e.kicks)
        round = adjustKicks(round, players[i].id, h.number, 1);
      while (round.scores[players[i].id][h.number]!.kicks > e.kicks)
        round = adjustKicks(round, players[i].id, h.number, -1);
    }
  });
  return { ...round, finishedAt: Date.now() };
}

describe('armar jugadores', () => {
  it('invitados llevan solo nombre y registrados llevan profileId y estado', () => {
    const players = buildPlayers([
      { kind: 'registered', userId: 'pa', name: 'Ani', accepted: true },
      { kind: 'guest', name: '  Carlos  ' },
      { kind: 'guest', name: '   ' },
    ]);
    assert.equal(players.length, 2);
    assert.equal(players[0].name, 'Ani');
    assert.equal(players[0].profileId, 'pa');
    assert.equal(players[0].accepted, true);
    assert.equal(players[1].name, 'Carlos');
    assert.equal(players[1].profileId, undefined);
  });

  it('una persona registrada no puede jugar dos veces en la misma ronda', () => {
    const players = buildPlayers([
      { kind: 'registered', userId: 'pa', name: 'Ani', accepted: true },
      { kind: 'registered', userId: 'pa', name: 'Ani', accepted: true },
    ]);
    assert.equal(players.length, 1);
  });
});

describe('ranking', () => {
  it('los invitados no aparecen en el ranking', () => {
    const r = finishedRound([{ profile: ana, kicks: 3 }, { name: 'Invitado', kicks: 2 }]);
    const ranking = buildRanking([r], profiles, 'best');
    assert.equal(ranking.length, 1);
    assert.equal(ranking[0].profile.id, 'pa');
  });

  it('mejor ronda: gana quien hizo menos patadas respecto al par', () => {
    const r1 = finishedRound([{ profile: ana, kicks: 4 }, { profile: beto, kicks: 3 }]);
    const ranking = buildRanking([r1], profiles, 'best');
    assert.equal(ranking[0].profile.id, 'pb');
    assert.equal(ranking[0].bestToPar, 0);
    assert.equal(ranking[1].bestToPar, 9);
    assert.equal(ranking[1].position, 2);
  });

  it('una ronda incompleta no cuenta para la mejor ronda', () => {
    const incompleta = finishedRound([{ profile: ana, kicks: 2, skipHoles: [9] }]);
    assert.equal(buildRanking([incompleta], profiles, 'best').length, 0);
  });

  it('una ronda sin terminar no cuenta', () => {
    const r = finishedRound([{ profile: ana, kicks: 3 }]);
    delete r.finishedAt;
    assert.equal(buildRanking([r], profiles, 'best').length, 0);
  });

  it('el promedio pide un mínimo de rondas', () => {
    const rounds = [finishedRound([{ profile: ana, kicks: 3 }]), finishedRound([{ profile: ana, kicks: 3 }])];
    assert.equal(buildRanking(rounds, profiles, 'average').length, 0);
    rounds.push(finishedRound([{ profile: ana, kicks: 4 }]));
    assert.equal(rounds.length, MIN_ROUNDS_FOR_AVERAGE);
    const avg = buildRanking(rounds, profiles, 'average');
    assert.equal(avg.length, 1);
    assert.equal(avg[0].avgToPar, 3); // (0 + 0 + 9) / 3
  });

  it('los hoyos en uno suman en su propia tabla', () => {
    const r = finishedRound([{ profile: ana, kicks: 1 }, { profile: beto, kicks: 3 }]);
    const aces = buildRanking([r], profiles, 'aces');
    assert.equal(aces.length, 1);
    assert.equal(aces[0].profile.id, 'pa');
    assert.equal(aces[0].aces, 9);
  });

  it('empates comparten posición', () => {
    const r = finishedRound([{ profile: ana, kicks: 3 }, { profile: beto, kicks: 3 }]);
    const ranking = buildRanking([r], profiles, 'best');
    assert.equal(ranking[0].position, 1);
    assert.equal(ranking[1].position, 1);
    assert.equal(ranking[0].tied, true);
  });

  it('positionOf devuelve null si el perfil no clasifica', () => {
    const r = finishedRound([{ profile: ana, kicks: 3 }]);
    assert.equal(positionOf(buildRanking([r], profiles, 'best'), 'pb'), null);
    assert.equal(positionOf(buildRanking([r], profiles, 'best'), 'pa'), 1);
  });

  it('sistema profesional de puntos (AAFG 92%): suma puntos por tarjeta y ordena', () => {
    const r1 = finishedRound([{ profile: ana, kicks: 3 }, { profile: beto, kicks: 4 }]);
    const pts = buildRanking([r1], profiles, 'points');
    assert.equal(pts.length, 2);
    assert.equal(pts[0].profile.id, 'pa');
    assert.ok(pts[0].points > pts[1].points);
  });

  it('extiende una ronda de 9 hoyos (Ida) a 18 hoyos (Ida y Vuelta)', () => {
    const r9 = createRound(holes, 'La Martina', [{ id: 'p1', name: 'Joaco' }], 'stroke');
    assert.equal(r9.holes.length, 9);
    const r18 = extendRoundWithBackNine(r9);
    assert.equal(r18.holes.length, 18);
    assert.equal(r18.currentHole, 10);
    assert.equal(r18.holes[9].number, 10);
  });
});

describe('datos de demostración', () => {
  const demo = buildDemoData(holes, 'Cancha de prueba', 1_700_000_000_000);

  it('genera perfiles y rondas marcados como demo', () => {
    assert.ok(demo.profiles.length >= 5);
    assert.ok(demo.profiles.every((p) => p.demo));
    assert.ok(demo.rounds.every((r) => r.demo && r.finishedAt));
  });

  it('es determinístico (mismo resultado siempre)', () => {
    const again = buildDemoData(holes, 'Cancha de prueba', 1_700_000_000_000);
    assert.deepEqual(
      again.rounds.map((r) => r.scores),
      demo.rounds.map((r) => r.scores),
    );
  });

  it('alcanza para llenar las tres tablas del ranking', () => {
    assert.ok(buildRanking(demo.rounds, demo.profiles, 'best').length >= 5);
    assert.ok(buildRanking(demo.rounds, demo.profiles, 'average').length >= 5);
    assert.ok(buildRanking(demo.rounds, demo.profiles, 'aces').length >= 1);
  });
});
