import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';

import { MAX_HOLES, sanitizeHoles, sanitizeVenue } from '../src/domain/config';
import { buildDuoRanking, type DuoRankingKind } from '../src/domain/duo';
import { buildRanking, positionOf, type RankingKind } from '../src/domain/ranking';
import { buildEighteenHoles, createRound, extendRoundWithBackNine, MAX_PLAYERS } from '../src/domain/round';
import { displayName, type DuoRule, type Player, type PlayFormat, type Profile, type Round } from '../src/domain/types';
import {
  allUsers, deleteRound, getConfig, getRound, getUserById, getUserByUsername, listRounds, putRound, setSetting,
  USER_COLS, type DB, type UserRow,
} from './db';
import {
  DUMMY_HASH, hashPassword, hashToken, newToken, RateLimiter, signJoinToken, verifyJoinToken, verifyPassword,
} from './auth';

/**
 * API DE LA CANCHA
 * Servidor HTTP sin librerías externas. Todas las rutas empiezan con /api.
 * Cada ruta declara quién puede usarla: 'none' (cualquiera), 'user' (con sesión) o 'admin'.
 */

export interface AppOptions {
  /** Usuario y clave del administrador inicial (se crea al arrancar si todavía no hay ninguno). */
  adminUser?: string;
  adminPassword?: string;
  /** Si es true, se pisa la clave del administrador con `adminPassword` (para cuando se olvida). */
  adminReset?: boolean;
  /** Orígenes autorizados a llamar a la API desde un navegador. '*' = cualquiera. */
  corsOrigin?: string;
  /** Diferencia horaria del club en minutos (Argentina: -180). Define cuándo empieza "hoy". */
  utcOffsetMinutes?: number;
  /** Clave para firmar los permisos de ronda. Si falta, se genera al azar en cada arranque. */
  secret?: string;
  /** Carpeta con la app web exportada (npx expo export --platform web) para servirla desde acá. */
  staticDir?: string;
  /** Registros nuevos permitidos por hora desde una misma IP (en la cancha muchos celulares comparten wifi). */
  registerLimitPerHour?: number;
  /** Detrás de un proxy (nginx, Cloudflare…): leer la IP real de X-Forwarded-For. */
  trustProxy?: boolean;
  now?: () => number;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
  ) {
    super(message);
  }
}

interface Ctx {
  req: IncomingMessage;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
  user: UserRow | null;
  tokenHash: string | null;
  ip: string;
}

type Raw = { raw: Buffer; contentType: string; headers?: Record<string, string> };
type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
type Auth = 'none' | 'user' | 'admin';

const FORMATS: PlayFormat[] = ['stroke', 'stableford', 'match-golf', 'match-football'];
const MAX_BODY = 450_000;
const SESSION_MS = 90 * 24 * 60 * 60 * 1000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, min: number, max: number, label: string): string {
  if (typeof v !== 'string') throw new HttpError(400, `${label}: falta completarlo.`, 'dato_invalido');
  const t = v.trim();
  if (t.length < min || t.length > max)
    throw new HttpError(400, `${label}: tiene que tener entre ${min} y ${max} caracteres.`, 'dato_invalido');
  return t;
}

function parseAvatar(dataUrl: unknown): { buf: Buffer; mime: string } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  if (!m) throw new HttpError(400, 'La foto tiene que ser JPG, PNG o WebP.', 'foto_invalida');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 150_000) throw new HttpError(413, 'La foto es muy pesada (máximo 150 KB).', 'foto_pesada');
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf[0] === 0x89 && buf.subarray(1, 4).toString() === 'PNG';
  const isWebp = buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
  if (!(isJpeg || isPng || isWebp)) throw new HttpError(400, 'El archivo no es una imagen válida.', 'foto_invalida');
  return { buf, mime: m[1] };
}

export function createApp(db: DB, options: AppOptions = {}) {
  const now = options.now ?? Date.now;
  const offset = options.utcOffsetMinutes ?? -180;
  const secret = options.secret ?? randomUUID() + randomUUID();
  const loginLimiter = new RateLimiter(8, 10 * 60 * 1000);
  const confirmLimiter = new RateLimiter(8, 10 * 60 * 1000);
  const registerLimiter = new RateLimiter(options.registerLimitPerHour ?? 30, 60 * 60 * 1000);

  // ── helpers de datos ────────────────────────────────────────────────────
  const userDto = (u: UserRow) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    nickname: u.nickname ?? undefined,
    displayName: displayName({ name: u.name, nickname: u.nickname ?? undefined }),
    role: u.role,
    avatarV: u.avatar_v,
    createdAt: u.created_at,
  });

  function createSession(userId: string): string {
    const token = newToken();
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
      hashToken(token), userId, now(), now() + SESSION_MS,
    );
    return token;
  }

  function authenticate(req: IncomingMessage): { user: UserRow; tokenHash: string } | null {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const tokenHash = hashToken(header.slice(7).trim());
    const cols = USER_COLS.split(', ').map((c) => `u.${c}`).join(', ');
    const user = db
      .prepare(`SELECT ${cols} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`)
      .get(tokenHash, now()) as unknown as UserRow | undefined;
    return user && !user.disabled ? { user, tokenHash } : null;
  }

  const canWrite = (u: UserRow, r: Round) =>
    u.role === 'admin' || r.createdBy === u.id || r.players.some((p) => p.profileId === u.id && p.accepted);
  const canRead = (u: UserRow, r: Round) => canWrite(u, r) || r.players.some((p) => p.profileId === u.id);

  /** Ronda activa donde la persona YA aceptó jugar (una invitación sin aceptar no bloquea). */
  function activeRoundOf(userId: string, exceptId?: string): Round | undefined {
    return listRounds(db, 'active', 500)
      .map((r) => r.round)
      .find((r) => r.id !== exceptId && r.players.some((p) => p.profileId === userId && p.accepted));
  }

  function loadRound(id: string, user: UserRow, need: 'read' | 'write'): { round: Round; excluded: boolean } {
    const row = getRound(db, id);
    if (!row) throw new HttpError(404, 'No existe esa ronda.', 'ronda_inexistente');
    const ok = need === 'write' ? canWrite(user, row.round) : canRead(user, row.round);
    if (!ok) throw new HttpError(403, 'No sos parte de esa ronda.', 'sin_permiso');
    return row;
  }

  const save = (round: Round, excluded: boolean): Round => {
    const next = { ...round, rev: (round.rev ?? 0) + 1 };
    putRound(db, next, excluded);
    return next;
  };

  // ── ranking ─────────────────────────────────────────────────────────────
  function periodStart(period: string): number {
    if (period === 'all') return 0;
    const local = new Date(now() + offset * 60_000);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const d = period === 'month' ? 1 : local.getUTCDate();
    return Date.UTC(y, m, d) - offset * 60_000;
  }

  function rankingData(period: string) {
    const users = allUsers(db).filter((u) => !u.disabled);
    const profiles: Profile[] = users.map((u) => ({
      id: u.id, name: u.name, nickname: u.nickname ?? undefined, createdAt: u.created_at,
    }));
    const since = periodStart(period);
    const rounds = listRounds(db, 'finished', 1_000_000)
      .filter((r) => !r.excluded && (r.round.finishedAt ?? 0) >= since)
      .map((r) => r.round);
    const avatarOf = new Map(users.map((u) => [u.id, u.avatar_v]));
    return { profiles, rounds, avatarOf };
  }

  function individualRanking(kind: RankingKind, period: string, meId?: string) {
    const { profiles, rounds, avatarOf } = rankingData(period);
    const entries = buildRanking(rounds, profiles, kind);
    const best = kind === 'best' ? entries : buildRanking(rounds, profiles, 'best');
    const average = kind === 'average' ? entries : buildRanking(rounds, profiles, 'average');
    const points = kind === 'points' ? entries : buildRanking(rounds, profiles, 'points');
    const aces = kind === 'aces' ? entries : buildRanking(rounds, profiles, 'aces');
    const dto = (e: (typeof entries)[number]) => ({
      position: e.position, tied: e.tied, userId: e.profile.id, name: displayName(e.profile),
      avatarV: avatarOf.get(e.profile.id) ?? null,
      rounds: e.rounds, bestStrokes: e.bestStrokes, bestToPar: e.bestToPar, avgToPar: e.avgToPar, points: e.points, aces: e.aces,
    });
    let me = null;
    if (meId) {
      const mine = best.find((e) => e.profile.id === meId);
      me = {
        userId: meId,
        position: positionOf(entries, meId),
        total: entries.length,
        stats: mine
          ? { rounds: mine.rounds, bestStrokes: mine.bestStrokes, bestToPar: mine.bestToPar, avgToPar: mine.avgToPar, points: mine.points, aces: mine.aces }
          : null,
        positions: {
          best: positionOf(best, meId),
          average: positionOf(average, meId),
          points: positionOf(points, meId),
          aces: positionOf(aces, meId),
        },
        totals: { best: best.length, average: average.length, points: points.length, aces: aces.length },
      };
    }
    return { mode: 'individual', kind, period, total: entries.length, entries: entries.map(dto), me };
  }

  function duoRanking(kind: DuoRankingKind, period: string, meId?: string) {
    const { profiles, rounds, avatarOf } = rankingData(period);
    const entries = buildDuoRanking(rounds, profiles, kind, getConfig(db).duoRule);
    const member = (p: Profile) => ({ userId: p.id, name: displayName(p), avatarV: avatarOf.get(p.id) ?? null });
    const dto = (e: (typeof entries)[number]) => ({
      position: e.position, tied: e.tied, key: e.key, members: [member(e.members[0]), member(e.members[1])],
      rounds: e.rounds, bestStrokes: e.bestStrokes, bestToPar: e.bestToPar, avgToPar: e.avgToPar, points: e.points,
    });
    const mine = meId ? entries.find((e) => e.members.some((m) => m.id === meId)) : undefined;
    return {
      mode: 'duo', kind, period, total: entries.length, entries: entries.map(dto),
      me: meId ? { userId: meId, position: mine?.position ?? null, total: entries.length, entry: mine ? dto(mine) : null } : null,
    };
  }

  const galleryDir = path.resolve('assets', 'galeria');
  function listFolderGallery(): string[] {
    try {
      if (!fs.existsSync(galleryDir)) return [];
      return fs
        .readdirSync(galleryDir)
        .filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith('.'))
        .sort()
        .map((f) => `/api/gallery/${encodeURIComponent(f)}`);
    } catch {
      return [];
    }
  }

  function fullConfig() {
    const cfg = getConfig(db);
    const folderUrls = listFolderGallery();
    const combined = [...folderUrls, ...(cfg.venue.heroImages ?? []).filter((u) => !folderUrls.includes(u))];
    return {
      ...cfg,
      venue: {
        ...cfg.venue,
        heroImages: combined,
      },
    };
  }

  // ── rutas ───────────────────────────────────────────────────────────────
  const routes: { method: string; re: RegExp; keys: string[]; auth: Auth; handler: Handler }[] = [];
  function route(method: string, pattern: string, auth: Auth, handler: Handler) {
    const keys: string[] = [];
    const re = new RegExp('^/api' + pattern.replace(/:(\w+)/g, (_m, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ method, re, keys, auth, handler });
  }

  route('GET', '/health', 'none', () => ({ ok: true }));

  route('GET', '/config', 'none', () => fullConfig());

  route('GET', '/gallery/:name', 'none', (ctx) => {
    const safeName = path.basename(ctx.params.name);
    if (!/\.(jpe?g|png|webp)$/i.test(safeName)) throw new HttpError(404, 'Imagen no encontrada.', 'no_encontrado');
    const file = path.join(galleryDir, safeName);
    if (!fs.existsSync(file)) throw new HttpError(404, 'Imagen no encontrada.', 'no_encontrado');
    const ext = path.extname(safeName).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return {
      raw: fs.readFileSync(file),
      contentType: mime,
      headers: { 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
    } satisfies Raw;
  });

  // Cuentas -------------------------------------------------------------------
  route('POST', '/auth/register', 'none', async (ctx) => {
    if (!registerLimiter.allowed(`reg|${ctx.ip}`, now()))
      throw new HttpError(429, 'Demasiados registros desde este lugar. Probá más tarde.', 'demasiados_intentos');
    const b = ctx.body;
    const username = str(b.username, 3, 20, 'Usuario');
    if (!/^[a-zA-Z0-9_.]+$/.test(username))
      throw new HttpError(400, 'Usuario: solo letras, números, punto y guión bajo.', 'dato_invalido');
    if (/^(admin|administrador|root)$/i.test(username) || /^demo_/i.test(username))
      throw new HttpError(400, 'Ese nombre de usuario está reservado.', 'usuario_reservado');
    const name = str(b.name, 2, 60, 'Nombre');
    const nickname = b.nickname ? str(b.nickname, 1, 20, 'Apodo') : null;
    const password = str(b.password, 6, 100, 'Contraseña');
    if (getUserByUsername(db, username)) throw new HttpError(409, 'Ese usuario ya existe. Elegí otro.', 'usuario_en_uso');
    const avatar = b.avatar ? parseAvatar(b.avatar) : null;

    const id = randomUUID();
    db.prepare(
      'INSERT INTO users (id, username, name, nickname, pass_hash, role, avatar, avatar_mime, avatar_v, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(id, username, name, nickname, await hashPassword(password), 'player', avatar?.buf ?? null, avatar?.mime ?? null, avatar ? now() : null, now());
    registerLimiter.fail(`reg|${ctx.ip}`, now());
    return { token: createSession(id), user: userDto(getUserById(db, id)!) };
  });

  route('POST', '/auth/login', 'none', async (ctx) => {
    const username = String(ctx.body.username ?? '').trim();
    const password = String(ctx.body.password ?? '');
    const key = `${ctx.ip}|${username.toLowerCase()}`;
    if (!loginLimiter.allowed(key, now()))
      throw new HttpError(429, 'Demasiados intentos. Esperá unos minutos y probá de nuevo.', 'demasiados_intentos');
    const user = getUserByUsername(db, username);
    const ok = await verifyPassword(password, user?.pass_hash ?? DUMMY_HASH); // siempre verifica: tarda lo mismo exista o no
    if (!user || !ok) {
      loginLimiter.fail(key, now());
      throw new HttpError(401, 'Usuario o contraseña incorrectos.', 'credenciales');
    }
    if (user.disabled) throw new HttpError(403, 'Tu cuenta está desactivada. Consultá con el administrador.', 'cuenta_desactivada');
    loginLimiter.reset(key);
    return { token: createSession(user.id), user: userDto(user) };
  });

  route('POST', '/auth/logout', 'user', (ctx) => {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(ctx.tokenHash);
    return { ok: true };
  });

  /** Confirmar identidad con usuario/contraseña o userId/contraseña para sumar a alguien a una ronda. Devuelve un permiso de 10 minutos. */
  route('POST', '/auth/verify', 'none', async (ctx) => {
    const authed = authenticate(ctx.req);
    const byUsername = typeof ctx.body.username === 'string' && ctx.body.username.trim().length > 0;
    const target = byUsername
      ? getUserByUsername(db, String(ctx.body.username).trim())
      : getUserById(db, String(ctx.body.userId ?? ''));
    const key = `verify|${authed?.user.id ?? ctx.ip}`;
    if (!confirmLimiter.allowed(key, now())) throw new HttpError(429, 'Demasiados intentos. Esperá unos minutos.', 'demasiados_intentos');
    const ok = await verifyPassword(String(ctx.body.password ?? ''), target?.pass_hash ?? DUMMY_HASH);
    if (!target || target.disabled || !ok) {
      confirmLimiter.fail(key, now());
      throw new HttpError(
        401,
        byUsername ? 'Usuario o contraseña incorrectos.' : 'Contraseña incorrecta.',
        'credenciales',
      );
    }
    confirmLimiter.reset(key);
    const sessionToken = !authed ? createSession(target.id) : undefined;
    return {
      joinToken: signJoinToken(target.id, secret, now()),
      userId: target.id,
      user: userDto(target),
      token: sessionToken,
    };
  });

  // Perfil --------------------------------------------------------------------
  const myStats = (userId: string) => individualRanking('best', 'all', userId).me;

  route('GET', '/me', 'user', (ctx) => ({ user: userDto(ctx.user!), ranking: myStats(ctx.user!.id) }));

  route('PATCH', '/me', 'user', (ctx) => {
    const b = ctx.body;
    const name = b.name !== undefined ? str(b.name, 2, 60, 'Nombre') : ctx.user!.name;
    const nickname = b.nickname !== undefined ? (b.nickname ? str(b.nickname, 1, 20, 'Apodo') : null) : ctx.user!.nickname;
    db.prepare('UPDATE users SET name = ?, nickname = ? WHERE id = ?').run(name, nickname, ctx.user!.id);
    return { user: userDto(getUserById(db, ctx.user!.id)!) };
  });

  route('PUT', '/me/avatar', 'user', (ctx) => {
    const { buf, mime } = parseAvatar(ctx.body.image);
    db.prepare('UPDATE users SET avatar = ?, avatar_mime = ?, avatar_v = ? WHERE id = ?').run(buf, mime, now(), ctx.user!.id);
    return { user: userDto(getUserById(db, ctx.user!.id)!) };
  });

  route('DELETE', '/me/avatar', 'user', (ctx) => {
    db.prepare('UPDATE users SET avatar = NULL, avatar_mime = NULL, avatar_v = NULL WHERE id = ?').run(ctx.user!.id);
    return { user: userDto(getUserById(db, ctx.user!.id)!) };
  });

  route('POST', '/me/password', 'user', async (ctx) => {
    const key = `pw|${ctx.user!.id}`;
    if (!confirmLimiter.allowed(key, now())) throw new HttpError(429, 'Demasiados intentos. Esperá unos minutos.', 'demasiados_intentos');
    if (!(await verifyPassword(String(ctx.body.current ?? ''), ctx.user!.pass_hash))) {
      confirmLimiter.fail(key, now());
      throw new HttpError(401, 'La contraseña actual no es correcta.', 'credenciales');
    }
    const next = str(ctx.body.next, 6, 100, 'Contraseña nueva');
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(await hashPassword(next), ctx.user!.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(ctx.user!.id, ctx.tokenHash); // cierra las otras sesiones
    return { ok: true };
  });

  route('GET', '/users/:id/avatar', 'none', (ctx) => {
    const row = db.prepare('SELECT avatar, avatar_mime FROM users WHERE id = ? AND disabled = 0').get(ctx.params.id) as unknown as
      | { avatar: Uint8Array | null; avatar_mime: string | null } | undefined;
    if (!row?.avatar || !row.avatar_mime) throw new HttpError(404, 'Sin foto.', 'sin_foto');
    return {
      raw: Buffer.from(row.avatar), contentType: row.avatar_mime,
      headers: { 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff' },
    } satisfies Raw;
  });

  route('GET', '/users/search', 'user', (ctx) => {
    const q = (ctx.query.get('q') ?? '').trim();
    if (q.length < 2) return { users: [] };
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = db
      .prepare(`SELECT ${USER_COLS} FROM users WHERE disabled = 0 AND (username LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR nickname LIKE ? ESCAPE '\\') ORDER BY name LIMIT 8`)
      .all(like, like, like) as unknown as UserRow[];
    return { users: rows.map((u) => ({ id: u.id, username: u.username, displayName: userDto(u).displayName, avatarV: u.avatar_v })) };
  });

  // Ranking -------------------------------------------------------------------
  route('GET', '/ranking', 'none', (ctx) => {
    const mode = ctx.query.get('mode') === 'duo' ? 'duo' : 'individual';
    const period = ['today', 'month', 'all'].includes(ctx.query.get('period') ?? '') ? ctx.query.get('period')! : 'all';
    const meId = authenticate(ctx.req)?.user.id;
    const k = ctx.query.get('kind');
    if (mode === 'duo') return duoRanking(k === 'average' || k === 'points' ? k : 'best', period, meId);
    return individualRanking(k === 'average' || k === 'points' || k === 'aces' ? k : 'best', period, meId);
  });

  // Rondas --------------------------------------------------------------------
  route('POST', '/rounds', 'user', (ctx) => {
    const b = ctx.body;
    const user = ctx.user!;
    const mode = b.mode === 'duo' ? 'duo' : 'individual';
    const format: PlayFormat = FORMATS.includes(b.format as PlayFormat) ? (b.format as PlayFormat) : 'stroke';
    const id = typeof b.id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(b.id) ? b.id : randomUUID();

    const existing = getRound(db, id);
    if (existing) {
      if (existing.round.createdBy === user.id) return { round: existing.round }; // reintento del mismo pedido: no duplica
      throw new HttpError(409, 'Ya existe una ronda con ese identificador.', 'ronda_existente');
    }
    if (!Array.isArray(b.players)) throw new HttpError(400, 'Faltan los jugadores.', 'dato_invalido');

    const players: Player[] = [];
    const seenUsers = new Set<string>();
    const seenIds = new Set<string>();
    for (const p of b.players.slice(0, MAX_PLAYERS + 1)) {
      if (!isObj(p)) throw new HttpError(400, 'Jugador inválido.', 'dato_invalido');
      const pid = typeof p.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(p.id) ? p.id : randomUUID();
      if (seenIds.has(pid)) throw new HttpError(400, 'Jugadores repetidos.', 'dato_invalido');
      seenIds.add(pid);
      if (p.profileId) {
        const u = getUserById(db, String(p.profileId));
        if (!u || u.disabled) throw new HttpError(400, 'Uno de los jugadores registrados no existe.', 'dato_invalido');
        if (seenUsers.has(u.id)) throw new HttpError(400, 'Esa persona ya está en la ronda.', 'dato_invalido');
        seenUsers.add(u.id);
        const accepted = u.id === user.id || (typeof p.joinToken === 'string' && verifyJoinToken(p.joinToken, secret, now()) === u.id);
        if (accepted && activeRoundOf(u.id, id))
          throw new HttpError(409, `${userDto(u).displayName} ya está jugando otra ronda. Tiene que terminarla primero.`, 'ya_esta_jugando');
        players.push({ id: pid, name: userDto(u).displayName, profileId: u.id, accepted });
      } else {
        players.push({ id: pid, name: str(p.name, 1, 30, 'Nombre del jugador') });
      }
    }
    if (
      mode === 'duo'
        ? players.length < 2 || players.length % 2 !== 0 || players.length > MAX_PLAYERS
        : players.length < 1 || players.length > MAX_PLAYERS
    )
      throw new HttpError(
        400,
        mode === 'duo' ? 'Cada dúo son 2 personas (2, 4, 6… jugadores).' : `Una ronda es de 1 a ${MAX_PLAYERS} jugadores.`,
        'dato_invalido',
      );

    const config = getConfig(db);
    const holes = b.holesCount === 18 ? buildEighteenHoles(config.course.holes) : config.course.holes;
    const created = createRound(holes, config.course.name, players, format, {
      mode, duoRule: config.duoRule as DuoRule, createdBy: user.id, id,
    });
    const round = save({ ...created, remote: true, startedAt: now(), rev: 0 }, false);
    return { round };
  });

  route('GET', '/me/active-round', 'user', (ctx) => {
    const u = ctx.user!;
    const round = listRounds(db, 'active', 500)
      .map((r) => r.round)
      .find((r) => r.createdBy === u.id || r.players.some((p) => p.profileId === u.id));
    return { round: round ?? null };
  });

  route('GET', '/me/rounds', 'user', (ctx) => {
    const u = ctx.user!;
    const rounds = listRounds(db, 'all', 200)
      .map((r) => r.round)
      .filter((r) => r.createdBy === u.id || r.players.some((p) => p.profileId === u.id));
    return { rounds };
  });

  route('GET', '/rounds/:id', 'user', (ctx) => {
    const { round } = loadRound(ctx.params.id, ctx.user!, 'read');
    const since = Number(ctx.query.get('since'));
    if (Number.isFinite(since) && since >= (round.rev ?? 0)) return { changed: false, rev: round.rev };
    return { changed: true, round };
  });

  route('POST', '/rounds/:id/scores', 'user', (ctx) => {
    const loaded = loadRound(ctx.params.id, ctx.user!, 'write');
    let round = loaded.round;
    const { excluded } = loaded;
    if (round.finishedAt) throw new HttpError(409, 'La ronda ya terminó.', 'ronda_terminada');
    const cells = ctx.body.cells;
    if (!Array.isArray(cells) || cells.length > 200) throw new HttpError(400, 'Cambios inválidos.', 'dato_invalido');
    // Si llega algún puntaje de la Vuelta (hoyos 10..18) antes del pedido explícito de back-nine, extendemos automáticamente la ronda para no perder ningún hoyo.
    if (
      round.holes.length <= 9 &&
      cells.some((c) => isObj(c) && Number(c.hole) > round.holes.length && Number(c.hole) <= 18)
    ) {
      round = extendRoundWithBackNine(round);
    }
    const scores = { ...round.scores };
    for (const c of cells) {
      if (!isObj(c)) throw new HttpError(400, 'Cambio inválido.', 'dato_invalido');
      const playerId = String(c.playerId);
      const hole = Number(c.hole);
      const kicks = Number(c.kicks);
      const penalties = Number(c.penalties ?? 0);
      if (!round.players.some((p) => p.id === playerId)) throw new HttpError(400, 'Jugador desconocido.', 'dato_invalido');
      if (!round.holes.some((h) => h.number === hole)) continue; // el hoyo ya no existe (la cancha cambió): se ignora
      if (!Number.isInteger(kicks) || kicks < 0 || kicks > 30 || !Number.isInteger(penalties) || penalties < 0 || penalties > 10)
        throw new HttpError(400, 'Puntaje fuera de rango.', 'dato_invalido');
      const sheet = { ...scores[playerId] };
      if (kicks === 0) delete sheet[hole];
      else sheet[hole] = { kicks, penalties };
      scores[playerId] = sheet;
    }
    return { round: save({ ...round, scores }, excluded) };
  });

  route('POST', '/rounds/:id/players/:playerId/confirm', 'user', async (ctx) => {
    const { round, excluded } = loadRound(ctx.params.id, ctx.user!, 'write');
    const player = round.players.find((p) => p.id === ctx.params.playerId);
    if (!player?.profileId) throw new HttpError(400, 'Ese jugador no es registrado.', 'dato_invalido');
    const target = getUserById(db, player.profileId);
    const key = `confirm|${ctx.user!.id}`;
    if (!confirmLimiter.allowed(key, now())) throw new HttpError(429, 'Demasiados intentos. Esperá unos minutos.', 'demasiados_intentos');
    if (!target || !(await verifyPassword(String(ctx.body.password ?? ''), target.pass_hash))) {
      confirmLimiter.fail(key, now());
      throw new HttpError(401, 'Contraseña incorrecta.', 'credenciales');
    }
    if (activeRoundOf(target.id, round.id)) throw new HttpError(409, `${userDto(target).displayName} ya está jugando otra ronda.`, 'ya_esta_jugando');
    confirmLimiter.reset(key);
    const players = round.players.map((p) => (p.id === player.id ? { ...p, accepted: true } : p));
    return { round: save({ ...round, players }, excluded) };
  });

  route('POST', '/rounds/:id/accept', 'user', (ctx) => {
    const { round, excluded } = loadRound(ctx.params.id, ctx.user!, 'read');
    if (!round.players.some((p) => p.profileId === ctx.user!.id)) throw new HttpError(403, 'No sos parte de esa ronda.', 'sin_permiso');
    if (activeRoundOf(ctx.user!.id, round.id)) throw new HttpError(409, 'Ya estás jugando otra ronda. Terminala primero.', 'ya_esta_jugando');
    const players = round.players.map((p) => (p.profileId === ctx.user!.id ? { ...p, accepted: true } : p));
    return { round: save({ ...round, players }, excluded) };
  });

  route('POST', '/rounds/:id/decline', 'user', (ctx) => {
    const { round, excluded } = loadRound(ctx.params.id, ctx.user!, 'read');
    const me = round.players.find((p) => p.profileId === ctx.user!.id);
    if (!me) throw new HttpError(403, 'No sos parte de esa ronda.', 'sin_permiso');
    if (me.accepted) throw new HttpError(409, 'Ya aceptaste esta ronda.', 'ya_aceptada');
    const players = round.players.filter((p) => p.id !== me.id);
    if (players.length === 0) {
      deleteRound(db, round.id);
      return { round: null };
    }
    const scores = { ...round.scores };
    delete scores[me.id];
    return { round: save({ ...round, players, scores }, excluded) };
  });

  route('POST', '/rounds/:id/finish', 'user', (ctx) => {
    const { round, excluded } = loadRound(ctx.params.id, ctx.user!, 'write');
    if (round.finishedAt) return { round };
    return { round: save({ ...round, finishedAt: now() }, excluded) };
  });

  route('POST', '/rounds/:id/back-nine', 'user', (ctx) => {
    const { round, excluded } = loadRound(ctx.params.id, ctx.user!, 'write');
    if (round.finishedAt) throw new HttpError(409, 'La ronda ya terminó.', 'ronda_terminada');
    const extended = extendRoundWithBackNine(round);
    return { round: save(extended, excluded) };
  });

  route('POST', '/rounds/:id/reopen', 'user', (ctx) => {
    const { round, excluded } = loadRound(ctx.params.id, ctx.user!, 'write');
    for (const p of round.players)
      if (p.profileId && p.accepted && activeRoundOf(p.profileId, round.id))
        throw new HttpError(409, `${p.name} ya está jugando otra ronda.`, 'ya_esta_jugando');
    const { finishedAt: _f, ...rest } = round;
    return { round: save(rest, excluded) };
  });

  route('DELETE', '/rounds/:id', 'user', (ctx) => {
    const row = getRound(db, ctx.params.id);
    if (!row) return { ok: true };
    if (ctx.user!.role !== 'admin' && row.round.createdBy !== ctx.user!.id)
      throw new HttpError(403, 'Solo quien armó la ronda puede borrarla.', 'sin_permiso');
    deleteRound(db, row.round.id);
    return { ok: true };
  });

  // Administración ------------------------------------------------------------
  route('PUT', '/admin/config', 'admin', (ctx) => {
    const b = ctx.body;
    const current = getConfig(db);
    if (b.course !== undefined) {
      if (!isObj(b.course)) throw new HttpError(400, 'Datos de la cancha inválidos.', 'dato_invalido');
      const holes = sanitizeHoles(b.course.holes ?? current.course.holes);
      if (!holes.ok) throw new HttpError(400, holes.error, 'dato_invalido');
      const name = b.course.name === undefined ? current.course.name : str(b.course.name, 1, 60, 'Nombre de la cancha');
      setSetting(db, 'course', { name, holes: holes.value });
    }
    if (b.venue !== undefined) {
      const venue = sanitizeVenue(b.venue, current.venue);
      if (!venue.ok) throw new HttpError(400, venue.error, 'dato_invalido');
      setSetting(db, 'venue', venue.value);
    }
    if (b.announcement !== undefined) {
      const text = typeof b.announcement === 'string' ? b.announcement.trim() : '';
      if (text.length > 200) throw new HttpError(400, 'Aviso: máximo 200 caracteres.', 'dato_invalido');
      setSetting(db, 'announcement', text);
    }
    if (b.duoRule !== undefined) {
      if (b.duoRule !== 'best' && b.duoRule !== 'sum') throw new HttpError(400, 'Regla de dúo inválida.', 'dato_invalido');
      setSetting(db, 'duoRule', b.duoRule);
    }
    return fullConfig();
  });

  route('POST', '/admin/gallery', 'admin', (ctx) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(ctx.body.image ?? ''));
    if (!m) throw new HttpError(400, 'La imagen tiene que ser JPG, PNG o WebP.', 'foto_invalida');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 350_000) throw new HttpError(413, 'La imagen es muy pesada (máximo 350 KB).', 'foto_pesada');
    const ext = m[1] === 'image/png' ? '.png' : m[1] === 'image/webp' ? '.webp' : '.jpg';
    fs.mkdirSync(galleryDir, { recursive: true });
    const filename = `inicio-${now()}-${Math.random().toString(36).slice(2, 6)}${ext}`;
    fs.writeFileSync(path.join(galleryDir, filename), buf);
    return fullConfig();
  });

  route('DELETE', '/admin/gallery/:name', 'admin', (ctx) => {
    const safeName = path.basename(ctx.params.name);
    const file = path.join(galleryDir, safeName);
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {
        // ignore
      }
    }
    const current = getConfig(db);
    const filtered = (current.venue.heroImages ?? []).filter(
      (u) => !u.endsWith(`/${encodeURIComponent(safeName)}`) && !u.endsWith(`/${safeName}`) && u !== ctx.params.name,
    );
    setSetting(db, 'venue', { ...current.venue, heroImages: filtered });
    return fullConfig();
  });

  route('GET', '/admin/users', 'admin', (ctx) => {
    const q = (ctx.query.get('q') ?? '').trim().toLowerCase();
    const users = allUsers(db).filter(
      (u) => !q || u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || (u.nickname ?? '').toLowerCase().includes(q),
    );
    return { users: users.slice(0, 100).map((u) => ({ ...userDto(u), disabled: u.disabled === 1 })) };
  });

  route('PATCH', '/admin/users/:id', 'admin', (ctx) => {
    const target = getUserById(db, ctx.params.id);
    if (!target) throw new HttpError(404, 'No existe ese usuario.', 'usuario_inexistente');
    const isSelf = target.id === ctx.user!.id;
    const b = ctx.body;
    if (b.role !== undefined) {
      if (b.role !== 'player' && b.role !== 'admin') throw new HttpError(400, 'Rol inválido.', 'dato_invalido');
      if (isSelf && b.role !== target.role) throw new HttpError(400, 'No podés cambiar tu propio rol.', 'dato_invalido');
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role, target.id);
    }
    if (b.disabled !== undefined) {
      if (isSelf) throw new HttpError(400, 'No podés desactivar tu propia cuenta.', 'dato_invalido');
      db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(b.disabled ? 1 : 0, target.id);
      if (b.disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    }
    if (b.name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(str(b.name, 2, 60, 'Nombre'), target.id);
    if (b.nickname !== undefined)
      db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(b.nickname ? str(b.nickname, 1, 20, 'Apodo') : null, target.id);
    const u = getUserById(db, target.id)!;
    return { user: { ...userDto(u), disabled: u.disabled === 1 } };
  });

  route('POST', '/admin/users/:id/reset-password', 'admin', async (ctx) => {
    const target = getUserById(db, ctx.params.id);
    if (!target) throw new HttpError(404, 'No existe ese usuario.', 'usuario_inexistente');
    const password = str(ctx.body.password, 6, 100, 'Contraseña nueva');
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(await hashPassword(password), target.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id); // lo saca de todos sus celulares
    return { ok: true };
  });

  route('GET', '/admin/rounds', 'admin', () => {
    const users = new Map(allUsers(db).map((u) => [u.id, userDto(u).displayName]));
    return {
      rounds: listRounds(db, 'all', 80).map(({ round, excluded }) => ({
        id: round.id, startedAt: round.startedAt, finishedAt: round.finishedAt ?? null, mode: round.mode ?? 'individual',
        format: round.format, excluded, players: round.players.map((p) => ({ name: p.name, registered: !!p.profileId, accepted: p.accepted ?? false })),
        createdBy: round.createdBy ? (users.get(round.createdBy) ?? null) : null,
      })),
    };
  });

  route('PATCH', '/admin/rounds/:id', 'admin', (ctx) => {
    const row = getRound(db, ctx.params.id);
    if (!row) throw new HttpError(404, 'No existe esa ronda.', 'ronda_inexistente');
    let { round, excluded } = row;
    if (ctx.body.excluded !== undefined) excluded = !!ctx.body.excluded;
    if (ctx.body.finish === true && !round.finishedAt) round = { ...round, finishedAt: now() };
    return { round: save(round, excluded), excluded };
  });

  // ── administrador inicial ───────────────────────────────────────────────
  async function ensureAdmin(): Promise<void> {
    const username = options.adminUser ?? 'admin';
    const password = options.adminPassword ?? 'admin';
    const existing = getUserByUsername(db, username);
    const hash = await hashPassword(password);
    if (!existing) {
      db.prepare('INSERT INTO users (id, username, name, pass_hash, role, created_at) VALUES (?,?,?,?,?,?)').run(
        randomUUID(), username, 'Administrador', hash, 'admin', now(),
      );
    } else if (options.adminReset) {
      db.prepare("UPDATE users SET pass_hash = ?, role = 'admin', disabled = 0 WHERE id = ?").run(hash, existing.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
    }
  }

  // ── servidor HTTP ───────────────────────────────────────────────────────
  const cors = (res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', options.corsOrigin ?? '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  };

  function send(res: ServerResponse, status: number, body: unknown) {
    if (isRaw(body)) {
      res.writeHead(status, { 'Content-Type': body.contentType, ...body.headers });
      res.end(body.raw);
      return;
    }
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  }
  const isRaw = (b: unknown): b is Raw => isObj(b) && Buffer.isBuffer((b as Raw).raw);

  async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY) throw new HttpError(413, 'El pedido es demasiado grande.', 'demasiado_grande');
      chunks.push(chunk as Buffer);
    }
    if (size === 0) return {};
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return isObj(parsed) ? parsed : {};
    } catch {
      throw new HttpError(400, 'El pedido no es un JSON válido.', 'json_invalido');
    }
  }

  const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  };

  function serveStatic(urlPath: string, res: ServerResponse): boolean {
    const root = options.staticDir ? path.resolve(options.staticDir) : null;
    if (!root) return false;
    let file = path.resolve(root, '.' + decodeURIComponent(urlPath));
    if (!file.startsWith(root)) return false; // evita salir de la carpeta (../../)
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html'); // la app maneja sus propias rutas
    if (!fs.existsSync(file)) return false;
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': file.includes(`${path.sep}_expo${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
    return true;
  }

  async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    cors(res);
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        if (req.method === 'GET' && serveStatic(url.pathname, res)) return;
        throw new HttpError(404, 'No encontrado.', 'no_encontrado');
      }
      const match = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!match) throw new HttpError(404, 'No encontrado.', 'no_encontrado');
      const values = match.re.exec(url.pathname)!.slice(1);
      const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(values[i])]));
      const auth = authenticate(req);
      if (match.auth !== 'none' && !auth) throw new HttpError(401, 'Tenés que iniciar sesión.', 'sin_sesion');
      if (match.auth === 'admin' && auth!.user.role !== 'admin') throw new HttpError(403, 'Solo para administradores.', 'sin_permiso');
      const xff = options.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
      const ctx: Ctx = {
        req, params, query: url.searchParams,
        body: req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req),
        user: auth?.user ?? null, tokenHash: auth?.tokenHash ?? null, ip: xff || req.socket.remoteAddress || 'ip',
      };
      send(res, 200, await match.handler(ctx));
    } catch (e) {
      if (e instanceof HttpError) send(res, e.status, { error: e.message, code: e.code });
      else {
        console.error('Error inesperado:', e);
        send(res, 500, { error: 'Error del servidor.', code: 'error_servidor' });
      }
    }
  }

  return {
    handler,
    ensureAdmin,
    listen(port: number, host?: string): Promise<Server> {
      const server = createServer((req, res) => void handler(req, res));
      return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
    },
  };
}

export { MAX_HOLES };
