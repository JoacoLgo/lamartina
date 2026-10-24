import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../app';
import { openDb } from '../db';

let server: Server;
let base = '';
let clock = Date.UTC(2026, 9, 20, 15, 0, 0); // 20/10/2026 12:00 hora Argentina
let staticDir = '';

before(async () => {
  staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'static-'));
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<h1>app</h1>');
  const app = createApp(openDb(':memory:'), { adminPassword: 'clave-admin-1', staticDir, registerLimitPerHour: 1000, now: () => clock });
  await app.ensureAdmin();
  server = await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

interface Res { status: number; body: any }
async function api(method: string, p: string, body?: unknown, token?: string): Promise<Res> {
  const res = await fetch(base + '/api' + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function register(username: string, name = username, nickname?: string) {
  const r = await api('POST', '/auth/register', { username, name, nickname, password: 'secreto1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { token: r.body.token as string, id: r.body.user.id as string };
}

const PARS = [3, 3, 4, 3, 4, 3, 4, 3, 4]; // la cancha de fábrica (9 hoyos)

/** Carga todos los hoyos de varios jugadores: kicksFor(playerId, hole) -> patadas. */
function allCells(round: any, kicksFor: (playerId: string, par: number) => number) {
  return round.players.flatMap((p: any) =>
    round.holes.map((h: any) => ({ playerId: p.id, hole: h.number, kicks: kicksFor(p.id, h.par), penalties: 0 })),
  );
}

let adminToken = '';
describe('cuentas', () => {
  it('el administrador inicial puede entrar', async () => {
    const r = await api('POST', '/auth/login', { username: 'admin', password: 'clave-admin-1' });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.role, 'admin');
    adminToken = r.body.token;
  });

  it('registra, evita usuarios repetidos o reservados y exige contraseña decente', async () => {
    const ok = await api('POST', '/auth/register', { username: 'Tincho', name: 'Martín Gómez', nickname: 'Tincho', password: 'secreto1' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.role, 'player');
    assert.equal(ok.body.user.displayName, 'Tincho');
    assert.equal((await api('POST', '/auth/register', { username: 'tincho', name: 'Otro', password: 'secreto1' })).status, 409);
    assert.equal((await api('POST', '/auth/register', { username: 'admin', name: 'Falso', password: 'secreto1' })).status, 400);
    assert.equal((await api('POST', '/auth/register', { username: 'demo_x', name: 'Falso', password: 'secreto1' })).status, 400);
    assert.equal((await api('POST', '/auth/register', { username: 'nuevo1', name: 'Nuevo', password: '123' })).status, 400);
    assert.equal((await api('POST', '/auth/register', { username: 'a b', name: 'Nuevo', password: 'secreto1' })).status, 400);
  });

  it('login correcto, incorrecto y bloqueo tras muchos intentos', async () => {
    assert.equal((await api('POST', '/auth/login', { username: 'tincho', password: 'secreto1' })).status, 200);
    for (let i = 0; i < 8; i++) assert.equal((await api('POST', '/auth/login', { username: 'tincho', password: 'mala' })).status, 401);
    assert.equal((await api('POST', '/auth/login', { username: 'tincho', password: 'secreto1' })).status, 429); // bloqueado
    clock += 11 * 60 * 1000; // pasan 11 minutos
    assert.equal((await api('POST', '/auth/login', { username: 'tincho', password: 'secreto1' })).status, 200);
  });

  it('no se puede usar la API sin sesión ni con un token inventado', async () => {
    assert.equal((await api('GET', '/me')).status, 401);
    assert.equal((await api('GET', '/me', undefined, 'token-falso')).status, 401);
  });

  it('cambiar la contraseña cierra las otras sesiones', async () => {
    const u = await register('cambia');
    const second = (await api('POST', '/auth/login', { username: 'cambia', password: 'secreto1' })).body.token;
    assert.equal((await api('POST', '/me/password', { current: 'mala', next: 'nuevaclave' }, u.token)).status, 401);
    assert.equal((await api('POST', '/me/password', { current: 'secreto1', next: 'nuevaclave' }, u.token)).status, 200);
    assert.equal((await api('GET', '/me', undefined, u.token)).status, 200); // la actual sigue
    assert.equal((await api('GET', '/me', undefined, second)).status, 401); // la otra se cerró
    assert.equal((await api('POST', '/auth/login', { username: 'cambia', password: 'nuevaclave' })).status, 200);
  });

  it('cerrar sesión invalida el token', async () => {
    const u = await register('sale');
    await api('POST', '/auth/logout', {}, u.token);
    assert.equal((await api('GET', '/me', undefined, u.token)).status, 401);
  });
});

describe('rondas individuales', () => {
  it('una ronda con invitados se carga, se termina y suma al ranking solo al registrado', async () => {
    const ana = await register('ana_r', 'Ana Ranking', 'Ani');
    const create = await api('POST', '/rounds', {
      id: 'ronda-ana-1', mode: 'individual', format: 'stroke',
      players: [{ id: 'p1', name: 'Ani', profileId: ana.id }, { id: 'p2', name: 'Carlos' }],
    }, ana.token);
    assert.equal(create.status, 200, JSON.stringify(create.body));
    const round = create.body.round;
    assert.equal(round.holes.length, 9);
    assert.equal(round.players[0].accepted, true); // yo mismo: aceptado
    assert.equal(round.players[1].profileId, undefined);

    // par en todos los hoyos para Ani, y uno de más para el invitado
    const cells = allCells(round, (pid, par) => (pid === 'p1' ? par : par + 1));
    const sent = await api('POST', '/rounds/ronda-ana-1/scores', { cells }, ana.token);
    assert.equal(sent.status, 200);
    assert.equal(sent.body.round.scores.p1[1].kicks, 3);

    // reenviar lo mismo no rompe nada (idempotente) y borrar un hoyo (kicks 0) funciona
    await api('POST', '/rounds/ronda-ana-1/scores', { cells: [{ playerId: 'p2', hole: 9, kicks: 0, penalties: 0 }] }, ana.token);
    const got = await api('GET', '/rounds/ronda-ana-1', undefined, ana.token);
    assert.equal(got.body.round.scores.p2[9], undefined);
    await api('POST', '/rounds/ronda-ana-1/scores', { cells: [{ playerId: 'p2', hole: 9, kicks: 5, penalties: 0 }] }, ana.token);

    assert.equal((await api('POST', '/rounds/ronda-ana-1/finish', {}, ana.token)).status, 200);
    // ya terminada: no se aceptan más puntajes
    assert.equal((await api('POST', '/rounds/ronda-ana-1/scores', { cells: [{ playerId: 'p1', hole: 1, kicks: 2 }] }, ana.token)).status, 409);

    const ranking = await api('GET', '/ranking?kind=best&period=all');
    const mine = ranking.body.entries.find((e: any) => e.userId === ana.id);
    assert.ok(mine);
    assert.equal(mine.bestToPar, 0);
    assert.equal(mine.bestStrokes, 31);
    assert.equal(ranking.body.entries.some((e: any) => e.name === 'Carlos'), false); // el invitado no aparece
  });

  it('rechaza puntajes fuera de rango y jugadores que no existen', async () => {
    const bea = await register('bea_r');
    const r = (await api('POST', '/rounds', { id: 'ronda-bea-1', players: [{ id: 'q1', name: 'Bea' }] }, bea.token)).body.round;
    assert.equal(r.players.length, 1);
    assert.equal((await api('POST', '/rounds/ronda-bea-1/scores', { cells: [{ playerId: 'q1', hole: 1, kicks: 99, penalties: 0 }] }, bea.token)).status, 400);
    assert.equal((await api('POST', '/rounds/ronda-bea-1/scores', { cells: [{ playerId: 'zz', hole: 1, kicks: 3, penalties: 0 }] }, bea.token)).status, 400);
    assert.equal((await api('POST', '/rounds', { players: [] }, bea.token)).status, 400);
    // permite grupos familiares de más de 4 (ej. 6 jugadores) y rechaza más de MAX_PLAYERS (13)
    const family6 = await api(
      'POST',
      '/rounds',
      { id: 'ronda-familia-6', players: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `f${i}`, name: `Familiar ${i}` })) },
      bea.token,
    );
    assert.equal(family6.status, 200);
    assert.equal(family6.body.round.players.length, 6);
    assert.equal(
      (await api('POST', '/rounds', { players: Array.from({ length: 13 }, (_, i) => ({ id: `x${i}`, name: `J${i}` })) }, bea.token)).status,
      400,
    );
  });

  it('crear la misma ronda dos veces (reintento) no la duplica; otro usuario no puede pisarla', async () => {
    const cris = await register('cris_r');
    const body = { id: 'ronda-cris-1', players: [{ id: 'c1', name: 'Cris' }] };
    assert.equal((await api('POST', '/rounds', body, cris.token)).status, 200);
    assert.equal((await api('POST', '/rounds', body, cris.token)).status, 200);
    const otro = await register('otro_r');
    assert.equal((await api('POST', '/rounds', body, otro.token)).status, 409);
  });

  it('solo los participantes ven y escriben una ronda', async () => {
    const dani = await register('dani_r');
    const intruso = await register('intruso_r');
    await api('POST', '/rounds', { id: 'ronda-dani-1', players: [{ id: 'd1', name: 'Dani' }] }, dani.token);
    assert.equal((await api('GET', '/rounds/ronda-dani-1', undefined, intruso.token)).status, 403);
    assert.equal((await api('POST', '/rounds/ronda-dani-1/scores', { cells: [] }, intruso.token)).status, 403);
    assert.equal((await api('DELETE', '/rounds/ronda-dani-1', undefined, intruso.token)).status, 403);
    assert.equal((await api('GET', '/rounds/ronda-dani-1', undefined, adminToken)).status, 200); // el administrador sí puede verla
  });

  it('la sincronización devuelve "sin cambios" si no hay novedades', async () => {
    const eli = await register('eli_r');
    const r = (await api('POST', '/rounds', { id: 'ronda-eli-1', players: [{ id: 'e1', name: 'Eli' }] }, eli.token)).body.round;
    const same = await api('GET', `/rounds/ronda-eli-1?since=${r.rev}`, undefined, eli.token);
    assert.equal(same.body.changed, false);
    await api('POST', '/rounds/ronda-eli-1/scores', { cells: [{ playerId: 'e1', hole: 1, kicks: 3, penalties: 0 }] }, eli.token);
    assert.equal((await api('GET', `/rounds/ronda-eli-1?since=${r.rev}`, undefined, eli.token)).body.changed, true);
  });

  it('completa una partida con Ida y Vuelta (18 hoyos) sin perder ningún hoyo y suma al ranking', async () => {
    const fede = await register('fede_18', 'Fede Dieciocho', 'Fede18');
    const created = await api(
      'POST',
      '/rounds',
      { id: 'ronda-fede-18', mode: 'individual', format: 'stroke', players: [{ id: 'f1', name: 'Fede18', profileId: fede.id }] },
      fede.token,
    );
    assert.equal(created.status, 200);
    const r9 = created.body.round;
    assert.equal(r9.holes.length, 9);

    // Carga los primeros 9 hoyos (Ida)
    const frontCells = r9.holes.map((h: any) => ({ playerId: 'f1', hole: h.number, kicks: h.par, penalties: 0 }));
    assert.equal((await api('POST', '/rounds/ronda-fede-18/scores', { cells: frontCells }, fede.token)).status, 200);

    // Incluso si el primer puntaje de la Vuelta (hoyo 10) llega antes o junto con /back-nine, el servidor extiende a 18 hoyos y no lo descarta
    const h10Res = await api(
      'POST',
      '/rounds/ronda-fede-18/scores',
      { cells: [{ playerId: 'f1', hole: 10, kicks: 3, penalties: 0 }] },
      fede.token,
    );
    assert.equal(h10Res.status, 200);
    assert.equal(h10Res.body.round.holes.length, 18);
    assert.equal(h10Res.body.round.scores.f1[10].kicks, 3);

    // Llamar a /back-nine es idempotente y conserva los 18 hoyos y puntajes
    const backRes = await api('POST', '/rounds/ronda-fede-18/back-nine', {}, fede.token);
    assert.equal(backRes.status, 200);
    assert.equal(backRes.body.round.holes.length, 18);

    // Carga el resto de la Vuelta (11..18)
    const backCells = backRes.body.round.holes
      .filter((h: any) => h.number >= 11)
      .map((h: any) => ({ playerId: 'f1', hole: h.number, kicks: h.par, penalties: 0 }));
    const afterBack = await api('POST', '/rounds/ronda-fede-18/scores', { cells: backCells }, fede.token);
    assert.equal(afterBack.status, 200);

    // Verifica que los 18 hoyos estén completos en el servidor
    for (let h = 1; h <= 18; h++) {
      assert.ok(afterBack.body.round.scores.f1[h]?.kicks > 0, `Falta hoyo ${h}`);
    }

    assert.equal((await api('POST', '/rounds/ronda-fede-18/finish', {}, fede.token)).status, 200);
    const ranking = await api('GET', '/ranking?kind=best&period=all');
    const entry = ranking.body.entries.find((e: any) => e.userId === fede.id);
    assert.ok(entry);
    assert.equal(entry.bestToPar, 0);
  });
});

describe('jugadores registrados en una misma ronda', () => {
  it('la invitación sin confirmar queda pendiente, aparece en el celular del otro y puede aceptarla', async () => {
    const gus = await register('gus_r', 'Gustavo', 'Gus');
    const hugo = await register('hugo_r', 'Hugo', 'Hugo');
    const created = await api('POST', '/rounds', {
      id: 'ronda-gus-hugo', players: [{ id: 'g1', name: 'x', profileId: gus.id }, { id: 'h1', name: 'x', profileId: hugo.id }],
    }, gus.token);
    assert.equal(created.status, 200);
    assert.equal(created.body.round.players[1].accepted, false);
    assert.equal(created.body.round.players[1].name, 'Hugo'); // el nombre sale del servidor, no del cliente

    // Hugo inicia sesión en su celular y el servidor le muestra la ronda donde lo sumaron
    const active = await api('GET', '/me/active-round', undefined, hugo.token);
    assert.equal(active.body.round.id, 'ronda-gus-hugo');
    // pendiente: no puede cargar puntajes todavía
    assert.equal((await api('POST', '/rounds/ronda-gus-hugo/scores', { cells: [{ playerId: 'h1', hole: 1, kicks: 3 }] }, hugo.token)).status, 403);
    // acepta desde su celular y ya puede cargar
    assert.equal((await api('POST', '/rounds/ronda-gus-hugo/accept', {}, hugo.token)).status, 200);
    const w = await api('POST', '/rounds/ronda-gus-hugo/scores', { cells: [{ playerId: 'h1', hole: 1, kicks: 3, penalties: 0 }] }, hugo.token);
    assert.equal(w.status, 200);
    // y Gus ve ese puntaje desde su propio celular
    const seen = await api('GET', '/rounds/ronda-gus-hugo', undefined, gus.token);
    assert.equal(seen.body.round.scores.h1[1].kicks, 3);
  });

  it('con la contraseña de la otra persona (permiso de ronda) entra ya aceptada; con una mala, no', async () => {
    const ines = await register('ines_r', 'Inés');
    const jorge = await register('jorge_r', 'Jorge');
    assert.equal((await api('POST', '/auth/verify', { userId: jorge.id, password: 'mala' }, ines.token)).status, 401);
    const ok = await api('POST', '/auth/verify', { userId: jorge.id, password: 'secreto1' }, ines.token);
    assert.equal(ok.status, 200);
    // también permite verificar por nombre de usuario y contraseña (login rápido en Nueva Ronda)
    const byUser = await api('POST', '/auth/verify', { username: 'jorge_r', password: 'secreto1' });
    assert.equal(byUser.status, 200);
    assert.equal(byUser.body.user.displayName, 'Jorge');
    assert.ok(byUser.body.token);
    const created = await api('POST', '/rounds', {
      id: 'ronda-ines-jorge',
      players: [{ id: 'i1', name: 'x', profileId: ines.id }, { id: 'j1', name: 'x', profileId: jorge.id, joinToken: ok.body.joinToken }],
    }, ines.token);
    assert.equal(created.body.round.players[1].accepted, true);
    // un permiso robado/inventado no sirve para otra persona
    const mal = await api('POST', '/rounds', {
      id: 'ronda-ines-falsa',
      players: [{ id: 'z1', name: 'x', profileId: ines.id }, { id: 'z2', name: 'x', profileId: jorge.id, joinToken: 'inventado.xyz' }],
    }, ines.token);
    assert.equal(mal.status, 409); // Inés ya está jugando otra ronda
  });

  it('confirmar desde la ronda con contraseña: mal = 401, bien = aceptada', async () => {
    const kari = await register('kari_r', 'Kari');
    const leo = await register('leo_r', 'Leo');
    await api('POST', '/rounds', { id: 'ronda-kari-leo', players: [{ id: 'k1', name: 'x', profileId: kari.id }, { id: 'l1', name: 'x', profileId: leo.id }] }, kari.token);
    assert.equal((await api('POST', '/rounds/ronda-kari-leo/players/l1/confirm', { password: 'mala' }, kari.token)).status, 401);
    const ok = await api('POST', '/rounds/ronda-kari-leo/players/l1/confirm', { password: 'secreto1' }, kari.token);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.round.players[1].accepted, true);
  });

  it('una persona no puede estar en dos rondas activas a la vez', async () => {
    const mar = await register('mar_r', 'Mar');
    const nico = await register('nico_r', 'Nico');
    const permiso = (await api('POST', '/auth/verify', { userId: nico.id, password: 'secreto1' }, mar.token)).body.joinToken;
    assert.equal((await api('POST', '/rounds', { id: 'ronda-mar-1', players: [{ id: 'm1', name: 'x', profileId: mar.id }, { id: 'n1', name: 'x', profileId: nico.id, joinToken: permiso }] }, mar.token)).status, 200);
    const otra = await register('otra_r', 'Otra');
    const permiso2 = (await api('POST', '/auth/verify', { userId: nico.id, password: 'secreto1' }, otra.token)).body.joinToken;
    const dup = await api('POST', '/rounds', { id: 'ronda-otra-1', players: [{ id: 'o1', name: 'x', profileId: otra.id }, { id: 'n2', name: 'x', profileId: nico.id, joinToken: permiso2 }] }, otra.token);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.code, 'ya_esta_jugando');
    // al terminar la primera, Nico queda libre
    await api('POST', '/rounds/ronda-mar-1/finish', {}, mar.token);
    assert.equal((await api('POST', '/rounds', { id: 'ronda-otra-2', players: [{ id: 'o1', name: 'x', profileId: otra.id }, { id: 'n3', name: 'x', profileId: nico.id, joinToken: permiso2 }] }, otra.token)).status, 200);
  });

  it('rechazar una invitación pendiente saca a la persona de la ronda', async () => {
    const pau = await register('pau_r', 'Pau');
    const rafa = await register('rafa_r', 'Rafa');
    await api('POST', '/rounds', { id: 'ronda-pau-rafa', players: [{ id: 'pa', name: 'x', profileId: pau.id }, { id: 'ra', name: 'x', profileId: rafa.id }] }, pau.token);
    const r = await api('POST', '/rounds/ronda-pau-rafa/decline', {}, rafa.token);
    assert.equal(r.body.round.players.length, 1);
    assert.equal((await api('GET', '/me/active-round', undefined, rafa.token)).body.round, null);
  });

  it('buscar jugadores registrados', async () => {
    const t = await register('buscador_r');
    await register('zulema_busca', 'Zulema Quiroga', 'Zule');
    assert.equal((await api('GET', '/users/search?q=zule')).status, 401); // sin sesión no se puede buscar
    const ok = await api('GET', '/users/search?q=zule', undefined, t.token);
    assert.equal(ok.body.users.length, 1);
    assert.equal(ok.body.users[0].displayName, 'Zule');
    assert.equal((await api('GET', '/users/search?q=z', undefined, t.token)).body.users.length, 0); // mínimo 2 letras
    assert.equal((await api('GET', '/users/search?q=%25', undefined, t.token)).body.users.length, 0); // el comodín % no es comodín
  });
});

describe('dúos', () => {
  it('un dúo son exactamente 2 y entra en el ranking de dúos (no en el individual)', async () => {
    const s1 = await register('duo_a', 'Duo A', 'Ale');
    const s2 = await register('duo_b', 'Duo B', 'Beni');
    const permiso = (await api('POST', '/auth/verify', { userId: s2.id, password: 'secreto1' }, s1.token)).body.joinToken;
    const players = [{ id: 'da', name: 'x', profileId: s1.id }, { id: 'db', name: 'x', profileId: s2.id, joinToken: permiso }];
    assert.equal((await api('POST', '/rounds', { id: 'duo-malo', mode: 'duo', players: [players[0]] }, s1.token)).status, 400);
    for (let i = 1; i <= 2; i++) {
      const created = await api('POST', '/rounds', { id: `duo-ok-${i}`, mode: 'duo', players }, s1.token);
      assert.equal(created.status, 200, JSON.stringify(created.body));
      assert.equal(created.body.round.mode, 'duo');
      assert.equal(created.body.round.duoRule, 'best');
      const cells = allCells(created.body.round, (pid, par) => (pid === 'da' ? par : par + 2)); // mejor pelota: cuenta "da" (par)
      await api('POST', `/rounds/duo-ok-${i}/scores`, { cells }, s1.token);
      await api('POST', `/rounds/duo-ok-${i}/finish`, {}, s1.token);
    }
    const duo = await api('GET', '/ranking?mode=duo&kind=best&period=all', undefined, s1.token);
    assert.equal(duo.body.entries.length, 1);
    assert.deepEqual(duo.body.entries[0].members.map((m: any) => m.name).sort(), ['Ale', 'Beni']);
    assert.equal(duo.body.entries[0].bestToPar, 0);
    assert.equal(duo.body.entries[0].rounds, 2);
    assert.equal(duo.body.me.position, 1);
    const indiv = await api('GET', '/ranking?mode=individual&kind=best&period=all');
    assert.equal(indiv.body.entries.some((e: any) => e.name === 'Ale'), false);
  });
});

describe('ranking: períodos y "tu posición"', () => {
  it('"hoy" solo cuenta lo terminado hoy y devuelve mi posición aunque no esté en el podio', async () => {
    const hoy = await register('hoy_r', 'Hoy', 'Hoy');
    const ayer = await register('ayer_r', 'Ayer', 'Ayer');
    const play = async (u: { token: string; id: string }, id: string, extra: number) => {
      const r = (await api('POST', '/rounds', { id, players: [{ id: `${id}-p`, name: 'x', profileId: u.id }] }, u.token)).body.round;
      await api('POST', `/rounds/${id}/scores`, { cells: allCells(r, (_p, par) => par + extra) }, u.token);
      await api('POST', `/rounds/${id}/finish`, {}, u.token);
    };
    clock -= 24 * 60 * 60 * 1000; // ayer
    await play(ayer, 'ronda-ayer', 0);
    clock += 24 * 60 * 60 * 1000; // hoy
    await play(hoy, 'ronda-hoy', 1);

    const today = await api('GET', '/ranking?kind=best&period=today', undefined, hoy.token);
    const names = today.body.entries.map((e: any) => e.name);
    assert.ok(names.includes('Hoy'));
    assert.equal(names.includes('Ayer'), false);
    assert.equal(today.body.me.position, today.body.entries.find((e: any) => e.userId === hoy.id).position);
    assert.equal(today.body.me.stats.bestToPar, 9);

    const all = await api('GET', '/ranking?kind=best&period=all', undefined, hoy.token);
    assert.ok(all.body.entries.some((e: any) => e.name === 'Ayer'));
    assert.ok(all.body.me.total >= 2);
    assert.ok(all.body.me.positions.best >= 1);
    // sin sesión no hay "me"
    assert.equal((await api('GET', '/ranking?kind=best&period=all')).body.me, null);
  });
});

describe('foto de perfil', () => {
  // PNG de 1x1 píxel
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  it('se sube, se sirve con su tipo y se borra; rechaza lo que no es imagen', async () => {
    const u = await register('foto_r');
    assert.equal((await api('PUT', '/me/avatar', { image: 'data:text/html;base64,PGgxPg==' }, u.token)).status, 400);
    assert.equal((await api('PUT', '/me/avatar', { image: 'data:image/png;base64,AAAA' }, u.token)).status, 400); // dice PNG pero no lo es
    const up = await api('PUT', '/me/avatar', { image: PNG }, u.token);
    assert.equal(up.status, 200);
    assert.ok(up.body.user.avatarV);
    const img = await fetch(`${base}/api/users/${u.id}/avatar`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    await api('DELETE', '/me/avatar', undefined, u.token);
    assert.equal((await fetch(`${base}/api/users/${u.id}/avatar`)).status, 404);
  });
});

describe('administrador', () => {
  it('solo los administradores usan las rutas de admin', async () => {
    const u = await register('curioso_r');
    assert.equal((await api('PUT', '/admin/config', { announcement: 'hola' }, u.token)).status, 403);
    assert.equal((await api('GET', '/admin/users', undefined, u.token)).status, 403);
    assert.equal((await api('PUT', '/admin/config', { announcement: 'hola' })).status, 401);
  });

  it('cambia hoyos, aviso, regla de dúo y datos del lugar; las rondas nuevas usan lo nuevo y las viejas no cambian', async () => {
    const t = await register('antes_r');
    const vieja = (await api('POST', '/rounds', { id: 'ronda-vieja', players: [{ id: 'v1', name: 'x', profileId: t.id }] }, t.token)).body.round;
    assert.equal(vieja.holes.length, 9);
    await api('POST', '/rounds/ronda-vieja/finish', {}, t.token);

    const r = await api('PUT', '/admin/config', {
      course: { holes: [{ par: 3, distanceM: 60 }, { par: 4 }, { par: 5, tip: 'Cuidado con el árbol' }] },
      announcement: '  Hoy torneo a las 16 h  ',
      duoRule: 'sum',
      venue: { hours: 'Todos los días 9 a 19', route: [{ lat: -38.8857, lng: -62.0292 }, { lat: -38.885, lng: -62.03 }] },
    }, adminToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.course.holes.length, 3);
    assert.equal(r.body.announcement, 'Hoy torneo a las 16 h');
    assert.equal(r.body.venue.route.length, 2);

    const cfg = await api('GET', '/config');
    assert.equal(cfg.body.duoRule, 'sum');
    assert.equal(cfg.body.venue.name, 'La Martina'); // lo que no se tocó se conserva

    const nueva = (await api('POST', '/rounds', { id: 'ronda-nueva', players: [{ id: 'w1', name: 'x', profileId: t.id }] }, t.token)).body.round;
    assert.equal(nueva.holes.length, 3);
    assert.equal(nueva.holes[2].par, 5);
    assert.equal((await api('GET', '/rounds/ronda-vieja', undefined, t.token)).body.round.holes.length, 9);
    await api('POST', '/rounds/ronda-nueva/finish', {}, t.token);
  });

  it('rechaza datos inválidos de la cancha', async () => {
    assert.equal((await api('PUT', '/admin/config', { course: { holes: [] } }, adminToken)).status, 400);
    assert.equal((await api('PUT', '/admin/config', { course: { holes: [{ par: 0 }] } }, adminToken)).status, 400);
    assert.equal((await api('PUT', '/admin/config', { course: { holes: Array.from({ length: 19 }, () => ({ par: 3 })) } }, adminToken)).status, 400);
    assert.equal((await api('PUT', '/admin/config', { venue: { gate: { lat: 999, lng: 0 } } }, adminToken)).status, 400);
    assert.equal((await api('PUT', '/admin/config', { duoRule: 'otra' }, adminToken)).status, 400);
  });

  it('restablecer la contraseña saca al usuario de todos sus celulares', async () => {
    const u = await register('olvido_r');
    const list = await api('GET', '/admin/users?q=olvido', undefined, adminToken);
    assert.equal(list.body.users.length, 1);
    assert.equal((await api('POST', `/admin/users/${u.id}/reset-password`, { password: 'corta' }, adminToken)).status, 400);
    assert.equal((await api('POST', `/admin/users/${u.id}/reset-password`, { password: 'clave-nueva-1' }, adminToken)).status, 200);
    assert.equal((await api('GET', '/me', undefined, u.token)).status, 401);
    assert.equal((await api('POST', '/auth/login', { username: 'olvido_r', password: 'clave-nueva-1' })).status, 200);
  });

  it('desactivar a un jugador: no entra y desaparece del ranking; no se puede desactivar a sí mismo', async () => {
    const tramp = await register('tramposo_r', 'Tramposo', 'Tramposo');
    const r = (await api('POST', '/rounds', { id: 'ronda-trampa', players: [{ id: 'tp', name: 'x', profileId: tramp.id }] }, tramp.token)).body.round;
    await api('POST', '/rounds/ronda-trampa/scores', { cells: allCells(r, () => 1) }, tramp.token);
    await api('POST', '/rounds/ronda-trampa/finish', {}, tramp.token);
    assert.ok((await api('GET', '/ranking?kind=best&period=all')).body.entries.some((e: any) => e.name === 'Tramposo'));

    assert.equal((await api('PATCH', `/admin/users/${tramp.id}`, { disabled: true }, adminToken)).status, 200);
    assert.equal((await api('GET', '/me', undefined, tramp.token)).status, 401);
    assert.equal((await api('POST', '/auth/login', { username: 'tramposo_r', password: 'secreto1' })).status, 403);
    assert.equal((await api('GET', '/ranking?kind=best&period=all')).body.entries.some((e: any) => e.name === 'Tramposo'), false);

    const me = (await api('POST', '/auth/login', { username: 'admin', password: 'clave-admin-1' })).body.user;
    assert.equal((await api('PATCH', `/admin/users/${me.id}`, { disabled: true }, adminToken)).status, 400);
    assert.equal((await api('PATCH', `/admin/users/${me.id}`, { role: 'player' }, adminToken)).status, 400);
  });

  it('excluir una ronda del ranking, cerrar una trabada y borrarla', async () => {
    const t = await register('excluida_r', 'Excluida', 'Excluida');
    const r = (await api('POST', '/rounds', { id: 'ronda-excl', players: [{ id: 'ex', name: 'x', profileId: t.id }] }, t.token)).body.round;
    await api('POST', '/rounds/ronda-excl/scores', { cells: allCells(r, (_p, par) => par) }, t.token);
    // sigue activa: el admin la cierra
    const closed = await api('PATCH', '/admin/rounds/ronda-excl', { finish: true }, adminToken);
    assert.ok(closed.body.round.finishedAt);
    assert.ok((await api('GET', '/ranking?kind=best&period=all')).body.entries.some((e: any) => e.name === 'Excluida'));
    await api('PATCH', '/admin/rounds/ronda-excl', { excluded: true }, adminToken);
    assert.equal((await api('GET', '/ranking?kind=best&period=all')).body.entries.some((e: any) => e.name === 'Excluida'), false);
    const list = await api('GET', '/admin/rounds', undefined, adminToken);
    assert.equal(list.body.rounds.find((x: any) => x.id === 'ronda-excl').excluded, true);
    assert.equal((await api('DELETE', '/rounds/ronda-excl', undefined, adminToken)).status, 200);
    assert.equal((await api('GET', '/admin/rounds', undefined, adminToken)).body.rounds.some((x: any) => x.id === 'ronda-excl'), false);
  });
});

describe('servidor', () => {
  it('sirve la app web y no deja salir de la carpeta', async () => {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<h1>app<\/h1>/);
    const deep = await fetch(`${base}/ranking`); // ruta de la app: devuelve index.html
    assert.match(await deep.text(), /<h1>app<\/h1>/);
    const escape = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
    assert.doesNotMatch(await escape.text(), /root:/);
  });

  it('CORS y pedidos inválidos', async () => {
    const pre = await fetch(`${base}/api/rounds`, { method: 'OPTIONS' });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), '*');
    const bad = await fetch(`${base}/api/auth/login`, { method: 'POST', body: '{no es json', headers: { 'Content-Type': 'application/json' } });
    assert.equal(bad.status, 400);
    assert.equal((await fetch(`${base}/api/no-existe`)).status, 404);
    const big = await fetch(`${base}/api/auth/login`, { method: 'POST', body: 'x'.repeat(600_000) });
    assert.equal(big.status, 413);
  });
});
