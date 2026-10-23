import { Linking } from 'react-native';

/** Enlaces oficiales de Google Maps (funcionan sin clave de API). */
export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Abre la ruta desde donde esté la persona hasta la cancha. */
export function mapsDirectionsUrl(query: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

export function openUrl(url: string): void {
  Linking.openURL(url).catch(() => {
    // sin app o sin permiso para abrir el enlace: no hay nada más para hacer
  });
}
