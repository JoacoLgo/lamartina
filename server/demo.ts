import fs from 'node:fs';
import path from 'node:path';

import { buildDemoData, DEMO_PEOPLE } from '../src/domain/demo';
import { hashPassword } from './auth';
import { getConfig, openDb, putRound, type DB } from './db';

/**
 * DATOS DE DEMOSTRACIÓN (para mostrar el ranking lleno)
 *   npm run demo:cargar   → crea 8 jugadores de ejemplo (usuario demo_tincho, clave demo1234…) con rondas y dúos
 *   npm run demo:quitar   → los borra, con sus rondas
 * Los usuarios de ejemplo siempre empiezan con "demo_".
 */
function clear(db: DB): void {
  db.prepare("DELETE FROM rounds WHERE created_by LIKE 'demo-%'").run();
  db.prepare("DELETE FROM users WHERE id LIKE 'demo-%'").run();
}

async function main(): Promise<void> {
  const action = process.argv[2];
  const dbPath = process.env.DB_PATH ?? path.join('data', 'footgolf.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = openDb(dbPath);

  if (action === 'cargar') {
    clear(db);
    const config = getConfig(db);
    const demo = buildDemoData(config.course.holes, config.course.name);
    const hash = await hashPassword('demo1234');
    for (const p of DEMO_PEOPLE) {
      db.prepare('INSERT INTO users (id, username, name, nickname, pass_hash, role, created_at) VALUES (?,?,?,?,?,?,?)').run(
        p.id, p.username, p.name, p.nickname, hash, 'player', Date.now(),
      );
    }
    for (const round of demo.rounds) {
      const owner = round.players.find((p) => p.profileId)?.profileId;
      putRound(db, { ...round, createdBy: owner, rev: 1, remote: true });
    }
    console.log(`Listo: ${DEMO_PEOPLE.length} jugadores y ${demo.rounds.length} rondas de ejemplo. Usuario "demo_tincho", clave "demo1234".`);
  } else if (action === 'quitar') {
    clear(db);
    console.log('Datos de ejemplo borrados.');
  } else {
    console.log('Uso: npm run demo:cargar   |   npm run demo:quitar');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
