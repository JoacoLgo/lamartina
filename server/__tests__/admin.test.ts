import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { createApp } from '../app';
import { verifyPassword } from '../auth';
import { openDb } from '../db';

type Row = { pass_hash: string } | undefined;
const adminRow = (db: ReturnType<typeof openDb>, username = 'admin') =>
  db.prepare('SELECT pass_hash FROM users WHERE username = ?').get(username) as Row;

describe('administrador inicial sin ADMIN_PASSWORD', () => {
  it('no crea el administrador y avisa', async (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const db = openDb(':memory:');

    await createApp(db, {}).ensureAdmin();

    assert.equal(adminRow(db), undefined, 'no tiene que existir un usuario admin');
    assert.equal(warn.mock.callCount(), 1);
    assert.match(String(warn.mock.calls[0].arguments[0]), /ADMIN_PASSWORD/);
  });

  it('con ADMIN_RESET=1 no pisa la clave del administrador existente', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const db = openDb(':memory:');
    await createApp(db, { adminPassword: 'clave-original-1' }).ensureAdmin();
    const antes = adminRow(db)!.pass_hash;

    await createApp(db, { adminReset: true }).ensureAdmin();

    const despues = adminRow(db)!.pass_hash;
    assert.equal(despues, antes, 'la clave no tiene que cambiar');
    assert.equal(await verifyPassword('admin', despues), false, 'la clave nunca puede quedar en "admin"');
    assert.equal(await verifyPassword('clave-original-1', despues), true);
  });

  it('una clave vacía cuenta como que falta', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const db = openDb(':memory:');

    await createApp(db, { adminPassword: '' }).ensureAdmin();

    assert.equal(adminRow(db), undefined);
  });
});

describe('administrador inicial con ADMIN_PASSWORD', () => {
  it('lo crea con esa clave', async () => {
    const db = openDb(':memory:');

    await createApp(db, { adminPassword: 'una-clave-larga' }).ensureAdmin();

    const row = adminRow(db);
    assert.ok(row);
    assert.equal(await verifyPassword('una-clave-larga', row.pass_hash), true);
  });
});

mock.restoreAll();
