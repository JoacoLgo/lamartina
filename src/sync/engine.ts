import { api, ApiError, errorMessage } from '@/lib/api';
import { buildEighteenHoles, buildPlayers, createRound } from '@/domain/round';
import { ackCells, type Op } from '@/domain/sync';
import type { AppConfig } from '@/domain/config';
import type { PlayerSlot, PlayFormat, Round, RoundMode } from '@/domain/types';
import { useAppStore, type Me } from '@/store/useAppStore';

/**
 * MOTOR DE SINCRONIZACIÓN
 * Todo lo que habla con el servidor está acá. Idea central: la app SIEMPRE funciona con su copia local
 * y manda los cambios "cuando puede". Si se va la señal, los cambios quedan en la cola de envío y salen solos cuando vuelve.
 */
const store = () => useAppStore.getState();

// ── Sesión ──────────────────────────────────────────────────────────────────
interface AuthResponse {
  token: string;
  user: Me;
}

/** Después de entrar: sincroniza la ronda activa y el historial de rondas del jugador. */
async function afterLogin(): Promise<string | null> {
  try {
    const token = store().token;
    const [{ round }, historyRes] = await Promise.all([
      api<{ round: Round | null }>('GET', '/me/active-round', { token }),
      api<{ rounds: Round[] }>('GET', '/me/rounds', { token }).catch(() => ({ rounds: [] })),
    ]);
    for (const r of historyRes.rounds) {
      store().upsertRemoteRound(r);
    }
    if (round) {
      store().upsertRemoteRound(round);
      return round.id;
    }
  } catch {
    // sin conexión justo ahora: se reintenta en el próximo ciclo de sincronización
  }
  return null;
}

export async function login(username: string, password: string): Promise<{ activeRoundId: string | null }> {
  const res = await api<AuthResponse>('POST', '/auth/login', { body: { username, password } });
  store().setSession(res.token, res.user);
  return { activeRoundId: await afterLogin() };
}

export async function register(input: {
  username: string;
  name: string;
  nickname?: string;
  password: string;
  avatar?: string | null;
}): Promise<void> {
  const res = await api<AuthResponse>('POST', '/auth/register', { body: input });
  store().setSession(res.token, res.user);
}

export async function logout(): Promise<void> {
  const token = store().token;
  if (token) {
    await flush().catch(() => undefined); // intenta mandar lo pendiente antes de salir
    await api('POST', '/auth/logout', { token }).catch(() => undefined);
  }
  store().clearSession();
}

export async function refreshMe(): Promise<void> {
  const token = store().token;
  if (!token) return;
  const res = await api<{ user: Me }>('GET', '/me', { token });
  store().setMe(res.user);
}

export async function refreshConfig(): Promise<void> {
  const config = await api<AppConfig>('GET', '/config');
  store().setConfig(config);
}

// ── Rondas ──────────────────────────────────────────────────────────────────
export type StartResult = { ok: true; roundId: string } | { ok: false; error: string };

/** Arma una ronda. Con sesión se crea en el servidor (para compartirla); sin sesión queda solo en el celular. */
export async function startRound(
  slots: PlayerSlot[],
  format: PlayFormat,
  mode: RoundMode,
  holesCount?: 9 | 18,
): Promise<StartResult> {
  const { token, me, config } = store();
  const built = buildPlayers(slots);
  const players = built.map(({ joinToken: _t, ...p }) => p);
  if (players.length === 0) return { ok: false, error: 'Falta al menos un jugador.' };
  if (mode === 'duo' && (players.length < 2 || players.length % 2 !== 0)) {
    return { ok: false, error: 'En modo Dúo completá los 2 jugadores de cada pareja.' };
  }

  const holes = holesCount === 18 ? buildEighteenHoles(config.course.holes) : config.course.holes;
  const local = createRound(holes, config.course.name, players, format, {
    mode,
    duoRule: config.duoRule,
    createdBy: me?.id,
  });

  if (!token || !me) {
    store().addRound({ ...local, remote: false });
    return { ok: true, roundId: local.id };
  }

  try {
    const res = await api<{ round: Round }>('POST', '/rounds', {
      token,
      body: {
        id: local.id,
        mode,
        format,
        holesCount: holes.length === 18 ? 18 : undefined,
        players: built.map((p) => ({ id: p.id, name: p.name, profileId: p.profileId, joinToken: p.joinToken })),
      },
    });
    store().addRound({ ...res.round, remote: true });
    store().setOnline(true);
    return { ok: true, roundId: res.round.id };
  } catch (e) {
    if (e instanceof ApiError && e.network) {
      // Sin señal: solo se puede jugar offline si no hay otras personas registradas (hay que verificarlas en el servidor).
      const others = players.some((p) => p.profileId && p.profileId !== me.id);
      if (others) return { ok: false, error: 'Para sumar jugadores registrados hace falta conexión. Probá de nuevo o jugá con invitados.' };
      store().addRound({ ...local, remote: true }, true);
      store().setOnline(false);
      return { ok: true, roundId: local.id };
    }
    return { ok: false, error: errorMessage(e) };
  }
}

/** Extiende una ronda activa de 9 hoyos (Ida) agregando la Vuelta (hoyos 10 a 18). */
export async function continueToBackNine(roundId: string): Promise<void> {
  store().startBackNine(roundId);
  const { token, rounds } = store();
  const round = rounds.find((r) => r.id === roundId);
  if (token && round?.remote) {
    try {
      const res = await api<{ round: Round }>('POST', `/rounds/${roundId}/back-nine`, { token });
      store().upsertRemoteRound({ ...res.round, currentHole: 10 });
    } catch {
      // queda guardado localmente
    }
  }
}

/** El jugador invitado acepta desde su celular. */
export async function acceptRound(roundId: string): Promise<void> {
  const res = await api<{ round: Round }>('POST', `/rounds/${roundId}/accept`, { token: store().token });
  store().upsertRemoteRound(res.round);
}

export async function declineRound(roundId: string): Promise<void> {
  await api('POST', `/rounds/${roundId}/decline`, { token: store().token });
  store().removeRound(roundId);
}

/** Quien armó la ronda confirma a otro jugador con la contraseña de ESA persona. */
export async function confirmPlayer(roundId: string, playerId: string, password: string): Promise<void> {
  const res = await api<{ round: Round }>('POST', `/rounds/${roundId}/players/${playerId}/confirm`, {
    token: store().token,
    body: { password },
  });
  store().upsertRemoteRound(res.round);
}

/** Pide un "permiso de ronda" verificando la contraseña de otra persona (al armar la ronda). */
export async function verifyPlayer(userId: string, password: string): Promise<string> {
  const res = await api<{ joinToken: string }>('POST', '/auth/verify', { token: store().token, body: { userId, password } });
  return res.joinToken;
}

// ── Envío de lo pendiente ───────────────────────────────────────────────────
let flushing = false;

type CellOp = Extract<Op, { kind: 'cell' }>;

export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    for (let guard = 0; guard < 200; guard++) {
      const { token, outbox, rounds } = store();
      const op = outbox[0];
      if (!token || !op) break;
      const round = rounds.find((r) => r.id === op.roundId);
      const drop = () => store().setOutbox((o) => o.filter((x) => x !== op));

      try {
        if (!round && op.kind !== 'delete') {
          drop();
          continue;
        }
        if (op.kind === 'create' && round) {
          const res = await api<{ round: Round }>('POST', '/rounds', {
            token,
            body: {
              id: round.id,
              mode: round.mode,
              format: round.format,
              players: round.players.map((p) => ({ id: p.id, name: p.name, profileId: p.profileId })),
            },
          });
          drop();
          store().upsertRemoteRound(res.round);
        } else if (op.kind === 'cell' && round) {
          const sent = outbox.filter((o): o is CellOp => o.kind === 'cell' && o.roundId === op.roundId);
          const cells = sent.map((c) => {
            const s = round.scores[c.playerId]?.[c.hole];
            return { playerId: c.playerId, hole: c.hole, kicks: s?.kicks ?? 0, penalties: s?.penalties ?? 0 };
          });
          const res = await api<{ round: Round }>('POST', `/rounds/${op.roundId}/scores`, { token, body: { cells } });
          store().setOutbox((o) => ackCells(o, sent));
          store().upsertRemoteRound(res.round);
        } else if (op.kind === 'finish') {
          const res = await api<{ round: Round }>('POST', `/rounds/${op.roundId}/finish`, { token });
          drop();
          store().upsertRemoteRound(res.round);
        } else if (op.kind === 'reopen') {
          const res = await api<{ round: Round }>('POST', `/rounds/${op.roundId}/reopen`, { token });
          drop();
          store().upsertRemoteRound(res.round);
        } else if (op.kind === 'delete') {
          await api('DELETE', `/rounds/${op.roundId}`, { token });
          drop();
        }
        store().setOnline(true);
      } catch (e) {
        if (e instanceof ApiError && e.network) {
          store().setOnline(false);
          break; // sin señal: la cola queda como está y se reintenta
        }
        if (e instanceof ApiError && e.status === 401) {
          store().clearSession();
          break;
        }
        // Error "de negocio" (la ronda ya terminó, no existe, no tenés permiso…): se descarta para no trabar la cola.
        if (op.kind !== 'cell') drop();
        else store().setOutbox((o) => o.filter((x) => !(x.kind === 'cell' && x.roundId === op.roundId)));
        if (round) store().patchRound(round.id, { syncError: errorMessage(e) });
        if (e instanceof ApiError && (e.status === 404 || e.status === 403) && round) store().removeRound(round.id);
      }
    }
  } finally {
    flushing = false;
  }
}

/** Trae las novedades del servidor: puntajes que cargó otro celular, cambios de estado y rondas a las que te sumaron. */
export async function pull(): Promise<void> {
  const { token } = store();
  if (!token) return;
  try {
    for (const r of store().rounds.filter((x) => x.remote)) {
      const pending = store().outbox.some((o) => o.roundId === r.id && o.kind === 'create');
      if (pending) continue; // todavía no existe en el servidor
      try {
        const res = await api<{ changed: boolean; round?: Round }>('GET', `/rounds/${r.id}?since=${r.rev ?? 0}`, { token });
        if (res.changed && res.round) store().upsertRemoteRound(res.round);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
          // La borraron o ya no sos parte: se limpia del celular si no hay nada pendiente.
          if (!store().outbox.some((o) => o.roundId === r.id)) store().removeRound(r.id);
        } else throw e;
      }
    }
    const { round } = await api<{ round: Round | null }>('GET', '/me/active-round', { token });
    if (round && !store().rounds.some((x) => x.id === round.id)) store().upsertRemoteRound(round);
    store().setOnline(true);
  } catch (e) {
    if (e instanceof ApiError && e.network) store().setOnline(false);
    else if (e instanceof ApiError && e.status === 401) store().clearSession();
  }
}

export async function syncOnce(): Promise<void> {
  await flush();
  await pull();
}

let ticks = 0;
/** Se llama cada pocos segundos mientras la app está abierta. */
export async function syncTick(): Promise<void> {
  ticks += 1;
  if (ticks % 60 === 1) await refreshConfig().catch(() => undefined); // la configuración cambia poco
  await syncOnce();
}

export async function bootstrap(): Promise<void> {
  await refreshConfig().catch(() => undefined);
  const { token } = store();
  if (token) {
    try {
      await refreshMe();
      const historyRes = await api<{ rounds: Round[] }>('GET', '/me/rounds', { token });
      for (const r of historyRes.rounds) store().upsertRemoteRound(r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) store().clearSession();
    }
    await syncOnce();
  }
}
