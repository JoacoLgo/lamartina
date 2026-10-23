import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchStatus } from '../match';
import { adjustKicks, adjustPenalties, createRound, isRoundComplete, teeOrder } from '../round';
import { leaderboard, playerTotals, scoreName, scoreShape, stablefordPoints } from '../scoring';
import { defaultHoles, playerStats } from '../stats';
import type { PlayFormat, Round } from '../types';

const holes = defaultHoles(9); // 9 hoyos, par 3 cada uno

const players = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Beto' },
];

/** Helper: carga `kicks` patadas a un jugador en un hoyo, usando los reducers reales. */
function setKicks(round: Round, playerId: string, hole: number, kicks: number): Round {
  let r = adjustKicks(round, playerId, hole, 1); // primer toque => par (3)
  while ((r.scores[playerId]![hole]?.kicks ?? 0) < kicks) r = adjustKicks(r, playerId, hole, 1);
  while ((r.scores[playerId]![hole]?.kicks ?? 0) > kicks) r = adjustKicks(r, playerId, hole, -1);
  return r;
}

function newRound(format: PlayFormat): Round {
  return createRound(holes, 'Cancha de prueba', players, format);
}

describe('nombres y formas de resultado', () => {
  it('nombra los resultados respecto al par', () => {
    assert.equal(scoreName(1, 3), 'hole-in-one');
    assert.equal(scoreName(2, 4), 'eagle');
    assert.equal(scoreName(2, 3), 'birdie');
    assert.equal(scoreName(3, 3), 'par');
    assert.equal(scoreName(4, 3), 'bogey');
    assert.equal(scoreName(5, 3), 'double-bogey');
    assert.equal(scoreName(7, 3), 'worse');
  });

  it('usa círculo para bajo par y cuadrado para sobre par', () => {
    assert.equal(scoreShape(2, 3), 'circle');
    assert.equal(scoreShape(3, 3), 'none');
    assert.equal(scoreShape(4, 3), 'square');
    assert.equal(scoreShape(6, 3), 'double-square');
    assert.equal(scoreShape(1, 3), 'double-circle');
  });
});

describe('stableford', () => {
  it('da 2 puntos por par y nunca baja de 0', () => {
    assert.equal(stablefordPoints(3, 3), 2);
    assert.equal(stablefordPoints(2, 3), 3);
    assert.equal(stablefordPoints(1, 3), 4);
    assert.equal(stablefordPoints(4, 3), 1);
    assert.equal(stablefordPoints(5, 3), 0);
    assert.equal(stablefordPoints(9, 3), 0);
  });
});

describe('cargar puntajes', () => {
  it('el primer toque en "+" salta al par y el de "−" al par menos uno', () => {
    const plus = adjustKicks(newRound('stroke'), 'a', 1, 1);
    assert.equal(plus.scores.a[1]?.kicks, 3);
    const minus = adjustKicks(newRound('stroke'), 'a', 1, -1);
    assert.equal(minus.scores.a[1]?.kicks, 2);
  });

  it('las penalizaciones suman al total del hoyo', () => {
    let r = setKicks(newRound('stroke'), 'a', 1, 3);
    r = adjustPenalties(r, 'a', 1, 1);
    assert.equal(playerTotals(r, 'a').strokes, 4);
    assert.equal(playerTotals(r, 'a').penalties, 1);
  });

  it('no deja cargar penalizaciones en un hoyo vacío', () => {
    const r = adjustPenalties(newRound('stroke'), 'a', 1, 1);
    assert.equal(r.scores.a?.[1], undefined);
  });

  it('bajar patadas a 0 borra el puntaje (deshacer)', () => {
    let r = adjustKicks(newRound('stroke'), 'a', 1, 1); // 3
    r = adjustKicks(r, 'a', 1, -1); // 2
    r = adjustKicks(r, 'a', 1, -1); // 1
    r = adjustKicks(r, 'a', 1, -1); // 0 => borra
    assert.equal(r.scores.a[1], undefined);
  });

  it('no modifica la ronda original (inmutabilidad)', () => {
    const original = newRound('stroke');
    adjustKicks(original, 'a', 1, 1);
    assert.deepEqual(original.scores, {});
  });
});

describe('tabla de posiciones', () => {
  it('ordena por patadas respecto al par y marca empates', () => {
    let r = newRound('stroke');
    r = setKicks(r, 'a', 1, 3);
    r = setKicks(r, 'b', 1, 3);
    r = setKicks(r, 'a', 2, 2);
    r = setKicks(r, 'b', 2, 4);
    const rows = leaderboard(r);
    assert.equal(rows[0].player.id, 'a');
    assert.equal(rows[0].totals.toPar, -1);
    assert.equal(rows[1].totals.toPar, 1);
    assert.equal(rows[0].tied, false);
  });

  it('en stableford gana quien tiene más puntos', () => {
    let r = newRound('stableford');
    r = setKicks(r, 'a', 1, 4); // bogey = 1 punto
    r = setKicks(r, 'b', 1, 2); // birdie = 3 puntos
    assert.equal(leaderboard(r)[0].player.id, 'b');
  });

  it('los empatados comparten posición', () => {
    let r = newRound('stroke');
    r = setKicks(r, 'a', 1, 3);
    r = setKicks(r, 'b', 1, 3);
    const rows = leaderboard(r);
    assert.equal(rows[0].position, 1);
    assert.equal(rows[1].position, 1);
    assert.equal(rows[0].tied, true);
  });
});

describe('orden de salida', () => {
  it('en el hoyo 2 sale primero quien mejor jugó el hoyo 1', () => {
    let r = newRound('stroke');
    r = setKicks(r, 'a', 1, 4);
    r = setKicks(r, 'b', 1, 2);
    assert.deepEqual(teeOrder(r, 1).map((p) => p.id), ['a', 'b']);
    assert.deepEqual(teeOrder(r, 2).map((p) => p.id), ['b', 'a']);
  });

  it('si empatan, se mantiene el orden anterior', () => {
    let r = newRound('stroke');
    r = setKicks(r, 'a', 1, 3);
    r = setKicks(r, 'b', 1, 3);
    assert.deepEqual(teeOrder(r, 2).map((p) => p.id), ['a', 'b']);
  });

  it('el orden se arrastra de hoyo en hoyo', () => {
    let r = newRound('stroke');
    r = setKicks(r, 'a', 1, 4);
    r = setKicks(r, 'b', 1, 2); // hoyo 2: b, a
    r = setKicks(r, 'a', 2, 3);
    r = setKicks(r, 'b', 2, 3); // empate en hoyo 2 => hoyo 3 sigue b, a
    assert.deepEqual(teeOrder(r, 3).map((p) => p.id), ['b', 'a']);
  });
});

describe('match play', () => {
  it('estilo golf: gana el partido quien va arriba por más hoyos de los que quedan', () => {
    let r = newRound('match-golf');
    for (let h = 1; h <= 5; h++) {
      r = setKicks(r, 'a', h, 2);
      r = setKicks(r, 'b', h, 3);
    }
    const m = matchStatus(r)!;
    assert.equal(m.holesWonA, 5);
    assert.equal(m.holesRemaining, 4);
    assert.equal(m.decided, true);
    assert.equal(m.text, 'Ana gana 5&4');
  });

  it('estilo golf: si se juegan todos los hoyos, gana por diferencia de hoyos', () => {
    let r = newRound('match-golf');
    for (let h = 1; h <= 9; h++) {
      r = setKicks(r, 'a', h, h <= 5 ? 2 : 4); // Ana gana 5 hoyos, Beto 4
      r = setKicks(r, 'b', h, h <= 5 ? 3 : 3);
    }
    const m = matchStatus(r)!;
    assert.equal(m.holesRemaining, 0);
    assert.equal(m.text, 'Ana gana por 1 hoyo');
  });

  it('estilo golf: partido parejo', () => {
    let r = newRound('match-golf');
    r = setKicks(r, 'a', 1, 3);
    r = setKicks(r, 'b', 1, 3);
    assert.equal(matchStatus(r)!.text, 'Igualados');
  });

  it('estilo fútbol: cada hoyo ganado es un gol', () => {
    let r = newRound('match-football');
    r = setKicks(r, 'a', 1, 2);
    r = setKicks(r, 'b', 1, 3);
    r = setKicks(r, 'a', 2, 4);
    r = setKicks(r, 'b', 2, 3);
    r = setKicks(r, 'a', 3, 3);
    r = setKicks(r, 'b', 3, 3);
    const m = matchStatus(r)!;
    assert.equal(m.text, 'Ana 1 – 1 Beto');
    assert.equal(m.halved, 1);
  });

  it('no aplica a otros formatos', () => {
    assert.equal(matchStatus(newRound('stroke')), null);
  });
});

describe('ronda completa y estadísticas', () => {
  it('detecta cuando todos cargaron todos los hoyos', () => {
    let r = newRound('stroke');
    assert.equal(isRoundComplete(r), false);
    for (let h = 1; h <= 9; h++) {
      r = setKicks(r, 'a', h, 3);
      r = setKicks(r, 'b', h, 4);
    }
    assert.equal(isRoundComplete(r), true);
  });

  it('cuenta pares, bogeys y penalizaciones', () => {
    let r = newRound('stroke');
    r = setKicks(r, 'a', 1, 3); // par
    r = setKicks(r, 'a', 2, 4); // bogey
    r = adjustPenalties(r, 'a', 2, 1); // +1 penalización => total 5 = doble bogey
    const s = playerStats(r, 'a');
    assert.equal(s.counts.par, 1);
    assert.equal(s.counts['double-bogey'], 1);
    assert.equal(s.penalties, 1);
    assert.equal(s.frontStrokes, 8);
  });
});
