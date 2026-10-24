import fs from 'node:fs';
import path from 'node:path';

import { createApp } from './app';
import { openDb } from './db';

/**
 * ARRANQUE DEL SERVIDOR
 * Se configura con variables de entorno (ver server/README.md):
 *   PORT, DB_PATH, ADMIN_USER, ADMIN_PASSWORD, ADMIN_RESET, CORS_ORIGIN,
 *   STATIC_DIR, SECRET, TRUST_PROXY, UTC_OFFSET_MINUTES
 */
async function main(): Promise<void> {
  const env = process.env;
  const dbPath = env.DB_PATH ?? path.join('data', 'footgolf.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = openDb(dbPath);
  const app = createApp(db, {
    adminUser: env.ADMIN_USER ?? 'admin',
    adminPassword: env.ADMIN_PASSWORD ?? 'admin',
    adminReset: env.ADMIN_RESET === '1',
    corsOrigin: env.CORS_ORIGIN,
    secret: env.SECRET,
    staticDir: env.STATIC_DIR,
    trustProxy: env.TRUST_PROXY === '1',
    utcOffsetMinutes: env.UTC_OFFSET_MINUTES ? Number(env.UTC_OFFSET_MINUTES) : -180,
  });

  await app.ensureAdmin();
  const port = Number(env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Servidor listo en http://localhost:${port}  (base de datos: ${dbPath})`);
  if (env.STATIC_DIR) console.log(`Sirviendo la app web desde ${env.STATIC_DIR}`);
}

main().catch((e) => {
  console.error('No se pudo arrancar el servidor:', e);
  process.exit(1);
});
