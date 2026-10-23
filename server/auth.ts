import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * SEGURIDAD
 *  - Contraseñas: nunca se guardan; se guarda un "hash" con scrypt (lento a propósito,
 *    así probar millones de claves por fuerza bruta no sirve) y una sal distinta por usuario.
 *  - Sesiones: un token al azar. En la base se guarda solo su hash; si alguien lee la base
 *    no puede usar las sesiones.
 *  - Intentos: se limita cuántas contraseñas se pueden probar seguidas.
 */

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `s1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [version, saltB64, keyB64] = stored.split('$');
  if (version !== 's1' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual); // comparación en tiempo constante
}

/** Hash de relleno: se usa cuando el usuario no existe, para que tardar lo mismo no delate qué usuarios hay. */
export const DUMMY_HASH = `s1$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(64).toString('base64')}`;

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * "Permiso de ronda": cuando alguien confirma su contraseña al armar la ronda, el servidor
 * le da un permiso firmado y de vida corta (10 min) para sumarlo a esa ronda. Así la contraseña
 * viaja una sola vez y no hace falta guardarla en el celular de quien arma la ronda.
 */
export function signJoinToken(userId: string, secret: string, now: number, ttlMs = 10 * 60 * 1000): string {
  const payload = `${userId}.${now + ttlMs}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifyJoinToken(token: string, secret: string, now: number): string | null {
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const payload = Buffer.from(payloadB64, 'base64url').toString();
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const idx = payload.lastIndexOf('.');
  const expires = Number(payload.slice(idx + 1));
  return Number.isFinite(expires) && expires > now ? payload.slice(0, idx) : null;
}

/** Limitador simple en memoria: máximo `max` fallos cada `windowMs` por clave. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length > 0) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** ¿Puede intentar? (no cuenta el intento todavía) */
  allowed(key: string, now: number): boolean {
    return this.recent(key, now).length < this.max;
  }

  fail(key: string, now: number): void {
    this.hits.set(key, [...this.recent(key, now), now]);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
