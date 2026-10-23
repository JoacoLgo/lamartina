import { DatabaseSync } from 'node:sqlite';

import { DEFAULT_CONFIG } from '../src/config/defaults';
import type { AppConfig } from '../src/domain/config';
import type { Round } from '../src/domain/types';

/**
 * BASE DE DATOS (SQLite)
 * Un solo archivo (data/footgolf.db) con cuatro tablas: usuarios, sesiones,
 * configuración de la cancha y rondas. SQLite viene incluido en Node: no hay
 * que instalar ni configurar nada.
 */
export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT NOT NULL,
  nickname    TEXT,
  pass_hash   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'player',   -- 'player' | 'admin'
  avatar      BLOB,                              -- foto de perfil (chica)
  avatar_mime TEXT,
  avatar_v    INTEGER,                           -- cambia cada vez que se sube una foto nueva
  disabled    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,                  -- guardamos el hash, nunca el token
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rounds (
  id          TEXT PRIMARY KEY,
  data        TEXT NOT NULL,                     -- la ronda completa en JSON
  status      TEXT NOT NULL,                     -- 'active' | 'finished'
  mode        TEXT NOT NULL,                     -- 'individual' | 'duo'
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  finished_at INTEGER,
  excluded    INTEGER NOT NULL DEFAULT 0,        -- el administrador la saca del ranking
  rev         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS rounds_status ON rounds(status);
`;

export function openDb(file: string): DB {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

// ── Usuarios ──────────────────────────────────────────────────────────────
export interface UserRow {
  id: string;
  username: string;
  name: string;
  nickname: string | null;
  pass_hash: string;
  role: 'player' | 'admin';
  avatar_mime: string | null;
  avatar_v: number | null;
  disabled: number;
  created_at: number;
}

/** Columnas de usuario SIN la foto (que pesa) para no cargarla en cada consulta. */
export const USER_COLS =
  'id, username, name, nickname, pass_hash, role, avatar_mime, avatar_v, disabled, created_at';

export function getUserById(db: DB, id: string): UserRow | undefined {
  return db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id) as unknown as UserRow | undefined;
}
export function getUserByUsername(db: DB, username: string): UserRow | undefined {
  return db.prepare(`SELECT ${USER_COLS} FROM users WHERE username = ?`).get(username) as unknown as UserRow | undefined;
}
export function allUsers(db: DB): UserRow[] {
  return db.prepare(`SELECT ${USER_COLS} FROM users ORDER BY created_at`).all() as unknown as UserRow[];
}

// ── Configuración ─────────────────────────────────────────────────────────
export function getConfig(db: DB): AppConfig {
  const rows = db.prepare('SELECT key, value FROM settings').all() as unknown as { key: string; value: string }[];
  const stored: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value);
    } catch {
      // un valor dañado se ignora y se usa el de fábrica
    }
  }
  return {
    course: { ...DEFAULT_CONFIG.course, ...(stored.course as object) },
    venue: { ...DEFAULT_CONFIG.venue, ...(stored.venue as object) },
    announcement: (stored.announcement as string | undefined) ?? DEFAULT_CONFIG.announcement,
    duoRule: (stored.duoRule as AppConfig['duoRule'] | undefined) ?? DEFAULT_CONFIG.duoRule,
  };
}

export function setSetting(db: DB, key: string, value: unknown): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value),
  );
}

// ── Rondas ────────────────────────────────────────────────────────────────
export interface RoundRow {
  round: Round;
  excluded: boolean;
}

function toRoundRow(row: { data: string; excluded: number }): RoundRow {
  return { round: JSON.parse(row.data) as Round, excluded: row.excluded === 1 };
}

export function getRound(db: DB, id: string): RoundRow | undefined {
  const row = db.prepare('SELECT data, excluded FROM rounds WHERE id = ?').get(id) as unknown as
    | { data: string; excluded: number }
    | undefined;
  return row ? toRoundRow(row) : undefined;
}

export function putRound(db: DB, round: Round, excluded = false): void {
  db.prepare(
    `INSERT INTO rounds (id, data, status, mode, created_by, created_at, finished_at, excluded, rev)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, status = excluded.status, mode = excluded.mode,
       finished_at = excluded.finished_at, excluded = excluded.excluded, rev = excluded.rev`,
  ).run(
    round.id,
    JSON.stringify(round),
    round.finishedAt ? 'finished' : 'active',
    round.mode ?? 'individual',
    round.createdBy ?? null,
    round.startedAt,
    round.finishedAt ?? null,
    excluded ? 1 : 0,
    round.rev ?? 1,
  );
}

export function deleteRound(db: DB, id: string): void {
  db.prepare('DELETE FROM rounds WHERE id = ?').run(id);
}

export function listRounds(db: DB, where: 'active' | 'finished' | 'all', limit = 100): RoundRow[] {
  const sql =
    where === 'all'
      ? 'SELECT data, excluded FROM rounds ORDER BY created_at DESC LIMIT ?'
      : `SELECT data, excluded FROM rounds WHERE status = '${where}' ORDER BY created_at DESC LIMIT ?`;
  return (db.prepare(sql).all(limit) as unknown as { data: string; excluded: number }[]).map(toRoundRow);
}
