import type { HoleScore, Round } from './types';

/**
 * SINCRONIZACIÓN
 * Cada celular guarda su copia de la ronda. Mientras hay señal los cambios se
 * envían al servidor; sin señal se acumulan ("cola de envío") y salen cuando
 * vuelve. Esta función decide cómo combinar la versión del servidor con la local.
 */

/** Identifica una celda de la tarjeta: jugador + hoyo. */
export function cellKey(playerId: string, hole: number): string {
  return `${playerId}:${hole}`;
}

/**
 * Combina la ronda que llegó del servidor con la local:
 *  - Manda el servidor (jugadores, estado, puntajes de los demás).
 *  - Las celdas con cambios todavía sin enviar (`dirty`) conservan el valor local,
 *    así lo que acabás de tocar no "salta" hacia atrás mientras viaja.
 *  - El hoyo que estás mirando es solo tuyo: no se pisa.
 */
export function mergeRemoteRound(local: Round | undefined, remote: Round, dirty: ReadonlySet<string>): Round {
  const scores: Round['scores'] = {};
  for (const [playerId, sheet] of Object.entries(remote.scores)) scores[playerId] = { ...sheet };

  if (local) {
    for (const key of dirty) {
      const [playerId, holeStr] = [key.slice(0, key.lastIndexOf(':')), key.slice(key.lastIndexOf(':') + 1)];
      const hole = Number(holeStr);
      const value: HoleScore | undefined = local.scores[playerId]?.[hole];
      scores[playerId] = { ...scores[playerId], [hole]: value };
    }
  }

  return {
    ...remote,
    scores,
    currentHole: local?.currentHole ?? remote.currentHole,
    remote: true,
  };
}

// ── Cola de envío ("outbox") ────────────────────────────────────────────────
/**
 * Lista de cosas que el celular todavía tiene que mandarle al servidor.
 * Se guarda en el teléfono: si se cierra la app sin señal, no se pierde nada.
 */
export type Op =
  | { kind: 'create' | 'finish' | 'reopen' | 'delete'; roundId: string }
  | { kind: 'cell'; roundId: string; playerId: string; hole: number; v: number };

/** Anota que una celda cambió. Si ya estaba pendiente, sube su versión `v` (así sabemos si cambió mientras viajaba). */
export function queueCell(outbox: Op[], roundId: string, playerId: string, hole: number): Op[] {
  const idx = outbox.findIndex((o) => o.kind === 'cell' && o.roundId === roundId && o.playerId === playerId && o.hole === hole);
  if (idx === -1) return [...outbox, { kind: 'cell', roundId, playerId, hole, v: 1 }];
  const existing = outbox[idx] as Extract<Op, { kind: 'cell' }>;
  return outbox.map((o, i) => (i === idx ? { ...existing, v: existing.v + 1 } : o));
}

/** Agrega una operación de ronda (crear, terminar…) sin repetirla. */
export function queueRoundOp(outbox: Op[], kind: 'create' | 'finish' | 'reopen' | 'delete', roundId: string): Op[] {
  let next = outbox;
  if (kind === 'delete') next = outbox.filter((o) => o.roundId !== roundId || o.kind === 'create'); // borrar anula lo pendiente
  if (kind === 'finish') next = next.filter((o) => !(o.kind === 'reopen' && o.roundId === roundId));
  if (kind === 'reopen') next = next.filter((o) => !(o.kind === 'finish' && o.roundId === roundId));
  if (next.some((o) => o.kind === kind && o.roundId === roundId)) return next;
  return [...next, { kind, roundId }];
}

/** Celdas pendientes de una ronda, como conjunto de claves (para `mergeRemoteRound`). */
export function dirtyKeys(outbox: Op[], roundId: string): Set<string> {
  const keys = new Set<string>();
  for (const o of outbox) if (o.kind === 'cell' && o.roundId === roundId) keys.add(cellKey(o.playerId, o.hole));
  return keys;
}

/** Quita de la cola las celdas ya enviadas, salvo las que cambiaron mientras viajaban. */
export function ackCells(outbox: Op[], sent: Extract<Op, { kind: 'cell' }>[]): Op[] {
  return outbox.filter((o) => {
    if (o.kind !== 'cell') return true;
    const was = sent.find((c) => c.roundId === o.roundId && c.playerId === o.playerId && c.hole === o.hole);
    return !(was && was.v === o.v);
  });
}
