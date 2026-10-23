import type { LatLng, VenueConfig } from './config';

/**
 * GEOGRAFÍA Y GUÍA DE CAMINO
 * Con la posición del GPS del celular decide qué mensaje mostrarle a la persona
 * para que llegue a la tranquera y siga el camino correcto hasta el predio.
 * Son funciones puras (sin GPS ni pantalla), así se pueden probar con coordenadas inventadas.
 */

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distancia en metros entre dos puntos (fórmula de haversine). */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** ¿El punto está dentro del polígono? (algoritmo del rayo; sirve para áreas chicas como un predio). */
export function pointInPolygon(p: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Distancia en metros de un punto a una línea quebrada (la más corta a cualquiera de sus tramos). */
export function distanceToPolylineM(p: LatLng, line: LatLng[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return haversineM(p, line[0]);
  // Proyección plana local (metros alrededor del punto): sobra precisión para distancias de cientos de metros.
  const mPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M;
  const mPerDegLng = mPerDegLat * Math.cos(toRad(p.lat));
  const toXY = (q: LatLng) => ({ x: (q.lng - p.lng) * mPerDegLng, y: (q.lat - p.lat) * mPerDegLat });
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = toXY(line[i]);
    const b = toXY(line[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-a.x * dx - a.y * dy) / len2));
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    best = Math.min(best, Math.hypot(cx, cy));
  }
  return best;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export type GuidanceState = 'noGate' | 'far' | 'nearGate' | 'atGate' | 'onRoute' | 'offRoute' | 'arrived';

export interface Guidance {
  state: GuidanceState;
  message: string;
  distanceToGateM?: number;
  distanceToRouteM?: number;
}

export const ON_ROUTE_M = 35; //  hasta acá se considera "sobre el camino"
export const AT_GATE_M = 60; //   hasta acá se considera "en la tranquera"
export const NEAR_GATE_M = 1500;
export const NEAR_ROUTE_M = 250;

/** Qué decirle a la persona según dónde está parada. */
export function guidance(pos: LatLng, venue: VenueConfig): Guidance {
  if (!venue.gate) {
    return { state: 'noGate', message: 'Todavía no está cargada la ubicación de la tranquera.' };
  }
  const dGate = haversineM(pos, venue.gate);
  const hasRoute = venue.route.length >= 2;
  const dRoute = hasRoute ? distanceToPolylineM(pos, venue.route) : undefined;
  const base = { distanceToGateM: dGate, distanceToRouteM: dRoute };

  if (pointInPolygon(pos, venue.predio)) {
    return { state: 'arrived', message: `¡Llegaste! Estás dentro del predio de ${venue.name}.`, ...base };
  }
  if (dRoute !== undefined && dRoute <= ON_ROUTE_M && dGate > AT_GATE_M) {
    const end = venue.route[venue.route.length - 1];
    return {
      state: 'onRoute',
      message: `Vas por el camino correcto. Seguí la línea azul: faltan unos ${formatDistance(haversineM(pos, end))} hasta el predio.`,
      ...base,
    };
  }
  if (dGate <= AT_GATE_M) {
    return {
      state: 'atGate',
      message: hasRoute
        ? 'Estás en la tranquera. Pasala (cerrala después) y seguí el camino de tierra marcado en azul.'
        : 'Estás en la tranquera. Pasala (cerrala después) y seguí el camino de tierra.',
      ...base,
    };
  }
  if (dRoute !== undefined && dRoute <= NEAR_ROUTE_M) {
    return {
      state: 'offRoute',
      message: `Te saliste del camino: estás a ${formatDistance(dRoute)} de la línea azul. Volvé hasta ella para seguir.`,
      ...base,
    };
  }
  if (dGate <= NEAR_GATE_M) {
    return {
      state: 'nearGate',
      message: `Estás a ${formatDistance(dGate)} de la tranquera. Seguí por la ruta hasta el punto verde.`,
      ...base,
    };
  }
  return {
    state: 'far',
    message: `Estás a ${formatDistance(dGate)} de la tranquera. Tocá "Cómo llegar desde donde estoy" para navegar con Google Maps hasta ahí.`,
    ...base,
  };
}
