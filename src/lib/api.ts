import { Platform } from 'react-native';

/**
 * CLIENTE DE LA API
 * Dónde está el servidor:
 *  - Navegador servido por el propio servidor (producción): mismo origen, no hace falta configurar nada.
 *  - Navegador en desarrollo (npx expo start --web): el servidor corre en el puerto 3000 de la misma PC.
 *  - Celular: hay que decir la dirección con EXPO_PUBLIC_API_URL (ver .env.example).
 */
function resolveBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    return __DEV__ ? `http://${hostname}:3000` : origin;
  }
  return 'http://localhost:3000';
}

export const API_BASE = `${resolveBase()}/api`;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    /** true si ni siquiera se pudo hablar con el servidor (sin señal, servidor apagado…). */
    public network = false,
  ) {
    super(message);
  }
}

interface Options {
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
}

export async function api<T>(method: string, path: string, options: Options = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // respuesta que no es JSON (por ejemplo una página de error de un proxy)
    }
    if (!res.ok) {
      const body = (data ?? {}) as { error?: string; code?: string };
      throw new ApiError(body.error ?? `Error ${res.status}`, res.status, body.code ?? 'error');
    }
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('No hay conexión con el servidor.', 0, 'sin_conexion', true);
  } finally {
    clearTimeout(timer);
  }
}

/** Dirección de la foto de perfil (el número `v` cambia al subir una foto nueva y evita ver la vieja en caché). */
export function avatarUrl(userId: string, version: number | null | undefined): string | null {
  return version ? `${API_BASE}/users/${userId}/avatar?v=${version}` : null;
}

/** Convierte rutas relativas del servidor (como `/api/gallery/foto.jpg`) en URLs completas. */
export function resolveAssetUrl(u: string): string {
  if (!u) return u;
  if (u.startsWith('data:') || u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('/api/')) return `${API_BASE}${u.slice(4)}`;
  if (u.startsWith('/')) return `${resolveBase()}${u}`;
  return u;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
}
