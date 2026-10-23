import type { AppConfig } from '../domain/config';

/**
 * VALORES INICIALES DE LA CANCHA
 * Son los que usa la app la primera vez y si el servidor no responde. Una vez
 * que el administrador cambia algo desde la app (pantalla "Admin"), manda lo
 * que guarda el servidor, no este archivo.
 */
export const DEFAULT_CONFIG: AppConfig = {
  course: {
    name: 'La Martina',
    // ⚠️ DATOS DE EJEMPLO: el administrador tiene que cargar los hoyos reales desde la app.
    holes: [
      { number: 1, par: 3, distanceM: 70 },
      { number: 2, par: 3, distanceM: 85 },
      { number: 3, par: 4, distanceM: 120 },
      { number: 4, par: 3, distanceM: 65 },
      { number: 5, par: 4, distanceM: 130 },
      { number: 6, par: 3, distanceM: 90 },
      { number: 7, par: 4, distanceM: 115 },
      { number: 8, par: 3, distanceM: 75 },
      { number: 9, par: 4, distanceM: 140 },
    ],
  },
  venue: {
    name: 'La Martina',
    sport: 'Footgolf',
    tagline: 'Anotá tu ronda, seguí tu puntaje y competí en el ranking de la cancha.',
    address: 'Ruta 249 – Punta Alta, Buenos Aires',
    // Coordenadas de la tranquera (sacadas del enlace de Google Maps que pasó el club).
    mapsQuery: '-38.8856984,-62.0292186',
    gate: { lat: -38.8856984, lng: -62.0292186 },
    gateLabel: 'Tranquera de acceso',
    // El camino y el contorno del predio los dibuja el administrador sobre el mapa satelital.
    route: [],
    predio: [],
    hours: '',
    phone: '',
    whatsapp: '',
    instagram: 'https://www.instagram.com/lamartinafootgolf?utm_source=ig_web_button_share_sheet&srtk=ZDNlZDc0MzIxNw==',
    tiktok: 'https://www.tiktok.com/@lamartinafootgolf?_r=1&_t=ZS-97FQ31NiGTV',
    teamName: 'Punteros F.C.',
    teamDescription: 'El primer equipo puntaltense de Footgolf',
    teamInstagram: 'https://www.instagram.com/punteros.f.c?utm_source=ig_web_button_share_sheet&obrf=ZDNlZDc0MzIxNw==',
    heroEnabled: true,
    heroIntervalSec: 5,
    heroImages: [],
    arrival: [
      'Tomá la Ruta 249 y buscá la tranquera de acceso (el punto verde del mapa).',
      'Pasá la tranquera y seguí el camino de tierra marcado en azul, sin salirte de la huella.',
      'Andá despacio: el camino bordea una pista de motocross y puede haber motos.',
      'Dejá el auto cerca de la entrada del predio y buscá a quien te reciba.',
    ],
    firstVisit: [],
  },
  announcement: '',
  duoRule: 'best',
};
