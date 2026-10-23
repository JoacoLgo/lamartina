import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sanitizeHoles, sanitizeVenue } from '../config';
import { DEFAULT_CONFIG } from '../../config/defaults';
import { buildDemoData } from '../demo';
import { buildDuoRanking, duoTotals } from '../duo';
import { buildRanking } from '../ranking';
import { adjustKicks, buildPlayers, createRound } from '../round';
import { ackCells, cellKey, dirtyKeys, mergeRemoteRound, queueCell, queueRoundOp, type Op } from '../sync';
import type { Profile, Round } from '../types';

const holes = DEFAULT_CONFIG.course.holes.slice(0, 3); // 3 hoyos: par 3, 3, 4

function setKicks(round: Round, playerId: string, hole: number, kicks: number): Round {
  let r = adjustKicks(round, playerId, hole, 1);
  while ((r.scores[playerId][hole]?.kicks ?? 0) < kicks) r = adjustKicks(r, playerId, hole, 1);
  while ((r.scores[playerId][hole]?.kicks ?? 0) > kicks) r = adjustKicks(r, playerId, hole, -1);
  return r;
}

const ana: Profile = { id: 'ua', name: 'Ana', createdAt: 0 };
const beto: Profile = { id: 'ub', name: 'Beto', createdAt: 0 };
const caro: Profile = { id: 'uc', name: 'Caro', createdAt: 0 };

function duoRound(a: Profile, b: Profile, ka: number[], kb: number[], rule: 'best' | 'sum' = 'best'): Round {
  const players = buildPlayers([
    { kind: 'registered', userId: a.id, name: a.name, accepted: true },
    { kind: 'registered', userId: b.id, name: b.name, accepted: true },
  ]);
  let r = createRound(holes, 'Cancha', players, 'stroke', { mode: 'duo', duoRule: rule });
  holes.forEach((h, i) => {
    r = setKicks(r, players[0].id, h.number, ka[i]);
    r = setKicks(r, players[1].id, h.number, kb[i]);
  });
  return { ...r, finishedAt: Date.now() };
}

describe('dúos', () => {
  it('mejor pelota: en cada hoyo cuenta el mejor de los dos', () => {
    const r = duoRound(ana, beto, [3, 4, 4], [4, 3, 5]); // mejores: 3,3,4 = 10 vs par 10
    const t = duoTotals(r);
    assert.equal(t.strokes, 10);
    assert.equal(t.toPar, 0);
  });

  it('suma: se suman las patadas de los dos y el par cuenta doble', () => {
    const r = duoRound(ana, beto, [3, 3, 4], [4, 4, 5], 'sum'); // 7+7+9 = 23 vs par 20
    const t = duoTotals(r);
    assert.equal(t.strokes, 23);
    assert.equal(t.toPar, 3);
  });

  it('el ranking de dúos pide que los dos estén registrados y aceptados', () => {
    const profiles = [ana, beto, caro];
    const ok = duoRound(ana, beto, [3, 3, 4], [3, 3, 4]);
    const guest = createRound(holes, 'Cancha', buildPlayers([
      { kind: 'registered', userId: ana.id, name: 'Ana', accepted: true },
      { kind: 'guest', name: 'Invitado' },
    ]), 'stroke', { mode: 'duo' });
    const ranking = buildDuoRanking([ok, { ...guest, finishedAt: 1 }], profiles, 'best');
    assert.equal(ranking.length, 1);
    assert.equal(ranking[0].key, 'ua+ub');
  });

  it('el mismo par juega varias veces: se agrupa sin importar el orden', () => {
    const r1 = duoRound(ana, beto, [3, 3, 4], [3, 3, 4]);
    const r2 = duoRound(beto, ana, [4, 4, 5], [4, 4, 5]);
    const ranking = buildDuoRanking([r1, r2], [ana, beto], 'best');
    assert.equal(ranking.length, 1);
    assert.equal(ranking[0].rounds, 2);
    assert.equal(ranking[0].bestToPar, 0);
  });

  it('los dúos no cuentan en el ranking individual', () => {
    const r = duoRound(ana, beto, [3, 3, 4], [3, 3, 4]);
    assert.equal(buildRanking([r], [ana, beto], 'best').length, 0);
  });

  it('un jugador que no aceptó la ronda no cuenta', () => {
    const players = buildPlayers([
      { kind: 'registered', userId: ana.id, name: 'Ana', accepted: true },
      { kind: 'registered', userId: beto.id, name: 'Beto', accepted: false },
    ]);
    let r = createRound(holes, 'Cancha', players, 'stroke');
    for (const h of holes) for (const p of players) r = setKicks(r, p.id, h.number, 3);
    const ranking = buildRanking([{ ...r, finishedAt: 1 }], [ana, beto], 'best');
    assert.deepEqual(ranking.map((e) => e.profile.id), ['ua']);
  });

  it('los datos de demostración llenan también el ranking de dúos', () => {
    const demo = buildDemoData(DEFAULT_CONFIG.course.holes, 'Cancha');
    assert.ok(buildDuoRanking(demo.rounds, demo.profiles, 'best').length >= 4);
    assert.ok(buildDuoRanking(demo.rounds, demo.profiles, 'average').length >= 4);
  });
});

describe('sincronización', () => {
  const players = buildPlayers([{ kind: 'guest', name: 'Pablo' }, { kind: 'guest', name: 'Carlos' }]);
  const base = createRound(holes, 'Cancha', players, 'stroke');
  const [p1, p2] = players;

  it('manda el servidor, pero las celdas sin enviar conservan lo local', () => {
    let local = setKicks(base, p1.id, 1, 5); // yo toqué: 5 patadas
    let remote = setKicks(base, p1.id, 1, 3); // el servidor todavía tiene 3
    remote = setKicks(remote, p2.id, 1, 4); // otro cargó al jugador 2
    const merged = mergeRemoteRound(local, remote, new Set([cellKey(p1.id, 1)]));
    assert.equal(merged.scores[p1.id][1]?.kicks, 5); // lo mío sigue
    assert.equal(merged.scores[p2.id][1]?.kicks, 4); // lo del otro llega
    assert.equal(merged.remote, true);
    local = merged;
  });

  it('sin cambios pendientes, lo remoto pisa lo local', () => {
    const local = setKicks(base, p1.id, 1, 5);
    const remote = setKicks(base, p1.id, 1, 3);
    assert.equal(mergeRemoteRound(local, remote, new Set()).scores[p1.id][1]?.kicks, 3);
  });

  it('el hoyo que estás mirando es solo tuyo', () => {
    const local = { ...base, currentHole: 2 };
    const remote = { ...base, currentHole: 1 };
    assert.equal(mergeRemoteRound(local, remote, new Set()).currentHole, 2);
  });
});

describe('validación de la configuración', () => {
  it('numera los hoyos de corrido y limpia datos', () => {
    const r = sanitizeHoles([{ number: 9, par: 3 }, { par: '4', distanceM: '120', tip: '  a la izquierda ' }]);
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(r.value.map((h) => h.number), [1, 2]);
      assert.equal(r.value[1].par, 4);
      assert.equal(r.value[1].distanceM, 120);
      assert.equal(r.value[1].tip, 'a la izquierda');
    }
  });

  it('rechaza pares y cantidades inválidas', () => {
    assert.equal(sanitizeHoles([]).ok, false);
    assert.equal(sanitizeHoles([{ par: 0 }]).ok, false);
    assert.equal(sanitizeHoles([{ par: 3.5 }]).ok, false);
    assert.equal(sanitizeHoles(Array.from({ length: 19 }, () => ({ par: 3 }))).ok, false);
    assert.equal(sanitizeHoles([{ par: 3, distanceM: 5000 }]).ok, false);
  });

  it('valida los datos del lugar', () => {
    const ok = sanitizeVenue({ phone: '+54 9 291 555', whatsapp: '5492915550000', arrival: ['  Paso 1 ', ''] }, DEFAULT_CONFIG.venue);
    assert.ok(ok.ok);
    if (ok.ok) assert.deepEqual(ok.value.arrival, ['Paso 1']);
    assert.equal(sanitizeVenue({ whatsapp: '+54 9 291' }, DEFAULT_CONFIG.venue).ok, false);
    assert.equal(sanitizeVenue({ gate: { lat: 200, lng: 0 } }, DEFAULT_CONFIG.venue).ok, false);
    assert.equal(sanitizeVenue({ route: [{ lat: 1, lng: 2 }, { lat: 'x', lng: 3 }] }, DEFAULT_CONFIG.venue).ok, false);
    assert.equal(sanitizeVenue({ name: '   ' }, DEFAULT_CONFIG.venue).ok, false);
  });
});

describe('cola de envío (sin señal)', () => {
  const players = buildPlayers([{ kind: 'guest', name: 'Pablo' }]);
  const round = createRound(holes, 'Cancha', players, 'stroke');

  it('tocar la misma celda varias veces mantiene una sola entrada y sube su versión', () => {
    let q: Op[] = [];
    q = queueCell(q, round.id, players[0].id, 1);
    q = queueCell(q, round.id, players[0].id, 1);
    q = queueCell(q, round.id, players[0].id, 2);
    assert.equal(q.length, 2);
    assert.equal((q[0] as Extract<Op, { kind: 'cell' }>).v, 2);
    assert.equal((q[1] as Extract<Op, { kind: 'cell' }>).v, 1);
  });

  it('al confirmar el envío se quita lo enviado, pero no lo que cambió mientras viajaba', () => {
    let q: Op[] = queueCell([], round.id, players[0].id, 1);
    const sent = q.filter((o): o is Extract<Op, { kind: 'cell' }> => o.kind === 'cell'); // viaja v=1
    q = queueCell(q, round.id, players[0].id, 1); // mientras viaja, la persona vuelve a tocar → v=2
    q = ackCells(q, sent);
    assert.equal(q.length, 1);
    assert.equal((q[0] as Extract<Op, { kind: 'cell' }>).v, 2); // sigue pendiente
    const sent2 = q.filter((o): o is Extract<Op, { kind: 'cell' }> => o.kind === 'cell');
    assert.equal(ackCells(q, sent2).length, 0);
  });

  it('terminar y reabrir se anulan entre sí; borrar descarta lo pendiente', () => {
    let q: Op[] = [];
    q = queueRoundOp(q, 'finish', 'r1');
    q = queueRoundOp(q, 'finish', 'r1'); // no se repite
    assert.equal(q.length, 1);
    q = queueRoundOp(q, 'reopen', 'r1');
    assert.deepEqual(q.map((o) => o.kind), ['reopen']);
    q = queueCell(q, 'r1', 'p', 1);
    q = queueRoundOp(q, 'delete', 'r1');
    assert.deepEqual(q.map((o) => o.kind), ['delete']);
  });

  it('las celdas pendientes de una ronda se informan como conjunto', () => {
    let q: Op[] = queueCell([], 'r1', 'p1', 3);
    q = queueCell(q, 'r2', 'p2', 4);
    assert.deepEqual([...dirtyKeys(q, 'r1')], ['p1:3']);
  });
});
