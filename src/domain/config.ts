import type { DuoRule, Hole } from './types';

/**
 * CONFIGURACIÓN DE LA CANCHA (la edita el administrador desde la app)
 * Los valores iniciales están en src/config/defaults.ts; después manda lo que
 * guarda el servidor.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface VenueConfig {
  name: string;
  sport: string;
  tagline: string;
  address: string;
  /** Lo que usa Google Maps para buscar: dirección o "lat,lng". */
  mapsQuery: string;
  /** La tranquera por donde se entra. */
  gate: LatLng | null;
  gateLabel: string;
  /** Camino desde la tranquera hasta el predio (puntos en orden). */
  route: LatLng[];
  /** Contorno del predio. */
  predio: LatLng[];
  hours: string;
  phone: string;
  whatsapp: string;
  /** Redes sociales y equipo local */
  instagram: string;
  tiktok: string;
  teamName: string;
  teamDescription: string;
  teamInstagram: string;
  /** Carrusel de imágenes en el inicio (administrable) */
  heroEnabled: boolean;
  heroIntervalSec: number;
  heroImages: string[];
  arrival: string[];
  firstVisit: string[];
}

export interface CourseConfig {
  name: string;
  holes: Hole[];
}

export interface AppConfig {
  course: CourseConfig;
  venue: VenueConfig;
  /** Aviso que se muestra en el inicio ("Hoy torneo", "Cancha cerrada por lluvia"…). Vacío = sin aviso. */
  announcement: string;
  duoRule: DuoRule;
}

export const MAX_HOLES = 18;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(v: unknown, max: number, field: string): Result<string> {
  if (v === undefined || v === null) return { ok: true, value: '' };
  if (typeof v !== 'string') return { ok: false, error: `${field}: tiene que ser texto.` };
  const t = v.trim();
  if (t.length > max) return { ok: false, error: `${field}: máximo ${max} caracteres.` };
  return { ok: true, value: t };
}

/** Valida y limpia los hoyos que manda el administrador. */
export function sanitizeHoles(input: unknown): Result<Hole[]> {
  if (!Array.isArray(input)) return { ok: false, error: 'Los hoyos tienen que ser una lista.' };
  if (input.length < 1 || input.length > MAX_HOLES)
    return { ok: false, error: `La cancha tiene que tener entre 1 y ${MAX_HOLES} hoyos.` };
  const holes: Hole[] = [];
  for (let i = 0; i < input.length; i++) {
    const h = input[i];
    if (!isObj(h)) return { ok: false, error: `Hoyo ${i + 1}: datos inválidos.` };
    const par = Number(h.par);
    if (!Number.isInteger(par) || par < 1 || par > 7)
      return { ok: false, error: `Hoyo ${i + 1}: el par tiene que ser un número entero entre 1 y 7.` };
    let distanceM: number | undefined;
    if (h.distanceM !== undefined && h.distanceM !== null && h.distanceM !== '') {
      distanceM = Number(h.distanceM);
      if (!Number.isFinite(distanceM) || distanceM < 1 || distanceM > 1000)
        return { ok: false, error: `Hoyo ${i + 1}: la distancia tiene que estar entre 1 y 1000 metros.` };
      distanceM = Math.round(distanceM);
    }
    const tip = text(h.tip, 200, `Hoyo ${i + 1} (consejo)`);
    if (!tip.ok) return tip;
    holes.push({
      number: i + 1, // siempre numerados 1..N, aunque se hayan borrado hoyos del medio
      par,
      ...(distanceM !== undefined ? { distanceM } : {}),
      ...(tip.value ? { tip: tip.value } : {}),
    });
  }
  return { ok: true, value: holes };
}

function sanitizePoints(input: unknown, max: number, field: string): Result<LatLng[]> {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) return { ok: false, error: `${field}: tiene que ser una lista de puntos.` };
  if (input.length > max) return { ok: false, error: `${field}: máximo ${max} puntos.` };
  const pts: LatLng[] = [];
  for (const p of input) {
    const pt = sanitizePoint(p);
    if (!pt) return { ok: false, error: `${field}: hay un punto inválido.` };
    pts.push(pt);
  }
  return { ok: true, value: pts };
}

function sanitizePoint(p: unknown): LatLng | null {
  if (!isObj(p)) return null;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7 };
}

function sanitizeList(input: unknown, field: string): Result<string[]> {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) return { ok: false, error: `${field}: tiene que ser una lista.` };
  if (input.length > 20) return { ok: false, error: `${field}: máximo 20 líneas.` };
  const out: string[] = [];
  for (const item of input) {
    const t = text(item, 300, field);
    if (!t.ok) return t;
    if (t.value) out.push(t.value);
  }
  return { ok: true, value: out };
}

/** Valida y limpia los datos del lugar que manda el administrador. */
export function sanitizeVenue(input: unknown, base: VenueConfig): Result<VenueConfig> {
  if (!isObj(input)) return { ok: false, error: 'Datos del lugar inválidos.' };
  const v = { ...base, ...input } as Record<string, unknown>;

  const fields: [keyof VenueConfig, number, string][] = [
    ['name', 60, 'Nombre'],
    ['sport', 30, 'Deporte'],
    ['tagline', 160, 'Frase del inicio'],
    ['address', 160, 'Dirección'],
    ['mapsQuery', 160, 'Búsqueda del mapa'],
    ['gateLabel', 60, 'Nombre de la tranquera'],
    ['hours', 120, 'Horarios'],
    ['phone', 30, 'Teléfono'],
    ['whatsapp', 20, 'WhatsApp'],
    ['instagram', 300, 'Instagram'],
    ['tiktok', 300, 'TikTok'],
    ['teamName', 80, 'Nombre del equipo'],
    ['teamDescription', 160, 'Descripción del equipo'],
    ['teamInstagram', 300, 'Instagram del equipo'],
  ];
  const out: Record<string, unknown> = {};
  for (const [key, max, label] of fields) {
    const r = text(v[key], max, label);
    if (!r.ok) return r;
    out[key] = r.value;
  }
  if (out.name === '') return { ok: false, error: 'El nombre de la cancha no puede quedar vacío.' };
  if (!/^\d*$/.test(out.whatsapp as string)) return { ok: false, error: 'WhatsApp: solo números, con código de país.' };

  const gate = v.gate === null || v.gate === undefined ? null : sanitizePoint(v.gate);
  if (v.gate && !gate) return { ok: false, error: 'La ubicación de la tranquera es inválida.' };
  const route = sanitizePoints(v.route, 300, 'Camino');
  if (!route.ok) return route;
  const predio = sanitizePoints(v.predio, 300, 'Predio');
  if (!predio.ok) return predio;
  const arrival = sanitizeList(v.arrival, 'Cómo ingresar');
  if (!arrival.ok) return arrival;
  const firstVisit = sanitizeList(v.firstVisit, 'Primera visita');
  if (!firstVisit.ok) return firstVisit;

  const heroEnabled = v.heroEnabled === undefined ? base.heroEnabled : Boolean(v.heroEnabled);
  const rawInterval = v.heroIntervalSec === undefined ? base.heroIntervalSec : Number(v.heroIntervalSec);
  const heroIntervalSec = Number.isFinite(rawInterval) ? Math.min(30, Math.max(2, Math.round(rawInterval))) : 5;

  let heroImages = base.heroImages ?? [];
  if (v.heroImages !== undefined) {
    if (!Array.isArray(v.heroImages)) return { ok: false, error: 'Imágenes de inicio: tiene que ser una lista.' };
    if (v.heroImages.length > 20) return { ok: false, error: 'Imágenes de inicio: máximo 20 imágenes.' };
    heroImages = v.heroImages
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.length < 350_000)
      .map((x) => x.trim());
  }

  return {
    ok: true,
    value: {
      ...(out as unknown as VenueConfig),
      gate,
      route: route.value,
      predio: predio.value,
      arrival: arrival.value,
      firstVisit: firstVisit.value,
      heroEnabled,
      heroIntervalSec,
      heroImages,
    },
  };
}
