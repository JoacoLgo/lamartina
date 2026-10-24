import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_CONFIG } from '@/config/defaults';
import type { AppConfig } from '@/domain/config';
import { adjustKicks, adjustPenalties, extendRoundWithBackNine } from '@/domain/round';
import { mergeRemoteRound, queueCell, queueRoundOp, dirtyKeys, type Op } from '@/domain/sync';
import type { Round } from '@/domain/types';

/**
 * ESTADO GLOBAL DE LA APP (zustand) — guardado en el dispositivo
 *
 * Qué hay acá:
 *  - la sesión (quién inició sesión),
 *  - la configuración de la cancha (copia de lo que guarda el servidor),
 *  - las rondas que están en ESTE dispositivo,
 *  - la cola de envío: lo que falta mandar al servidor (por si se fue la señal).
 *
 * Este archivo solo cambia datos. Hablar con el servidor es trabajo de src/sync/engine.ts.
 */

export interface Me {
  id: string;
  username: string;
  name: string;
  nickname?: string;
  displayName: string;
  role: 'player' | 'admin';
  avatarV: number | null;
}

interface AppState {
  token: string | null;
  me: Me | null;
  config: AppConfig;
  rounds: Round[];
  outbox: Op[];
  /** ¿La última comunicación con el servidor funcionó? (no se guarda) */
  online: boolean;

  setSession: (token: string, me: Me) => void;
  setMe: (me: Me) => void;
  clearSession: () => void;
  setConfig: (config: AppConfig) => void;
  setOnline: (online: boolean) => void;

  addRound: (round: Round, queueCreate?: boolean) => void;
  upsertRemoteRound: (remote: Round) => void;
  removeRound: (roundId: string) => void;
  patchRound: (roundId: string, patch: Partial<Round>) => void;
  changeKicks: (roundId: string, playerId: string, hole: number, delta: 1 | -1) => void;
  changePenalties: (roundId: string, playerId: string, hole: number, delta: 1 | -1) => void;
  goToHole: (roundId: string, hole: number) => void;
  startBackNine: (roundId: string) => void;
  finishRound: (roundId: string) => void;
  reopenRound: (roundId: string) => void;
  deleteRound: (roundId: string) => void;
  setOutbox: (updater: (outbox: Op[]) => Op[]) => void;
  resetAll: () => void;
}

const updateRound = (rounds: Round[], id: string, fn: (r: Round) => Round) => rounds.map((r) => (r.id === id ? fn(r) : r));

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      token: null,
      me: null,
      config: DEFAULT_CONFIG,
      rounds: [],
      outbox: [],
      online: true,

      setSession: (token, me) => set({ token, me }),
      setMe: (me) => set({ me }),
      clearSession: () =>
        set((s) => ({
          token: null,
          me: null,
          // las rondas del servidor se quitan del celular (ya no es tu sesión); las que solo existen acá se quedan
          rounds: s.rounds.filter((r) => !r.remote),
          outbox: [],
        })),
      setConfig: (config) => set({ config }),
      setOnline: (online) => set({ online }),

      addRound: (round, queueCreate = false) =>
        set((s) => ({
          rounds: [round, ...s.rounds.filter((r) => r.id !== round.id)],
          outbox: queueCreate ? queueRoundOp(s.outbox, 'create', round.id) : s.outbox,
        })),

      /** Llega una ronda del servidor: se combina con la copia local sin pisar lo que todavía no se envió. */
      upsertRemoteRound: (remote) =>
        set((s) => {
          const local = s.rounds.find((r) => r.id === remote.id);
          const merged = mergeRemoteRound(local, remote, dirtyKeys(s.outbox, remote.id));
          return {
            rounds: local ? s.rounds.map((r) => (r.id === remote.id ? merged : r)) : [merged, ...s.rounds],
          };
        }),

      removeRound: (roundId) =>
        set((s) => ({
          rounds: s.rounds.filter((r) => r.id !== roundId),
          outbox: s.outbox.filter((o) => o.roundId !== roundId),
        })),

      patchRound: (roundId, patch) => set((s) => ({ rounds: updateRound(s.rounds, roundId, (r) => ({ ...r, ...patch })) })),

      changeKicks: (roundId, playerId, hole, delta) =>
        set((s) => {
          const round = s.rounds.find((r) => r.id === roundId);
          if (!round || round.finishedAt) return s;
          return {
            rounds: updateRound(s.rounds, roundId, (r) => adjustKicks(r, playerId, hole, delta)),
            outbox: round.remote ? queueCell(s.outbox, roundId, playerId, hole) : s.outbox,
          };
        }),

      changePenalties: (roundId, playerId, hole, delta) =>
        set((s) => {
          const round = s.rounds.find((r) => r.id === roundId);
          if (!round || round.finishedAt) return s;
          return {
            rounds: updateRound(s.rounds, roundId, (r) => adjustPenalties(r, playerId, hole, delta)),
            outbox: round.remote ? queueCell(s.outbox, roundId, playerId, hole) : s.outbox,
          };
        }),

      goToHole: (roundId, hole) => set((s) => ({ rounds: updateRound(s.rounds, roundId, (r) => ({ ...r, currentHole: hole })) })),

      startBackNine: (roundId) =>
        set((s) => {
          const round = s.rounds.find((r) => r.id === roundId);
          return {
            rounds: updateRound(s.rounds, roundId, (r) => extendRoundWithBackNine(r)),
            outbox: round?.remote ? queueRoundOp(s.outbox, 'back-nine', roundId) : s.outbox,
          };
        }),

      finishRound: (roundId) =>
        set((s) => {
          const round = s.rounds.find((r) => r.id === roundId);
          return {
            rounds: updateRound(s.rounds, roundId, (r) => ({ ...r, finishedAt: Date.now() })),
            outbox: round?.remote ? queueRoundOp(s.outbox, 'finish', roundId) : s.outbox,
          };
        }),

      reopenRound: (roundId) =>
        set((s) => {
          const round = s.rounds.find((r) => r.id === roundId);
          return {
            rounds: updateRound(s.rounds, roundId, (r) => {
              const { finishedAt: _f, ...rest } = r;
              return rest;
            }),
            outbox: round?.remote ? queueRoundOp(s.outbox, 'reopen', roundId) : s.outbox,
          };
        }),

      deleteRound: (roundId) =>
        set((s) => {
          const round = s.rounds.find((r) => r.id === roundId);
          const outbox = round?.remote ? queueRoundOp(s.outbox, 'delete', roundId) : s.outbox.filter((o) => o.roundId !== roundId);
          return { rounds: s.rounds.filter((r) => r.id !== roundId), outbox };
        }),

      setOutbox: (updater) => set((s) => ({ outbox: updater(s.outbox) })),

      resetAll: () => set({ token: null, me: null, rounds: [], outbox: [] }),
    }),
    {
      name: 'footgolf-la-martina',
      version: 3, // v1: canchas elegibles · v2: perfiles locales · v3: cuentas en el servidor
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ online: _online, ...rest }) => rest as unknown as AppState,
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<AppState>;
        const persistedVenue = persisted.config?.venue;
        const mergedConfig: AppConfig = persisted.config
          ? {
              ...DEFAULT_CONFIG,
              ...persisted.config,
              venue: {
                ...DEFAULT_CONFIG.venue,
                ...persistedVenue,
                route:
                  persistedVenue?.route && persistedVenue.route.length > 0
                    ? persistedVenue.route
                    : DEFAULT_CONFIG.venue.route,
                predio:
                  persistedVenue?.predio && persistedVenue.predio.length > 0
                    ? persistedVenue.predio
                    : DEFAULT_CONFIG.venue.predio,
              },
            }
          : currentState.config;
        return {
          ...currentState,
          ...persisted,
          config: mergedConfig,
        };
      },
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as Record<string, unknown>;
        if (version < 3) {
          // Los perfiles locales de la versión anterior ya no existen: ahora son cuentas del servidor.
          delete old.profiles;
          delete old.currentProfileId;
          delete old.courses;
          old.token = null;
          old.me = null;
          old.outbox = [];
          old.config = DEFAULT_CONFIG;
          old.rounds = ((old.rounds as Round[] | undefined) ?? []).filter((r) => !r.demo);
        }
        return old as unknown as AppState;
      },
    },
  ),
);

/**
 * La lectura desde el almacenamiento es asíncrona: durante un instante el store
 * está vacío. Este hook avisa cuándo ya cargó.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useAppStore.persist.hasHydrated());
    return unsub;
  }, []);
  return hydrated;
}
