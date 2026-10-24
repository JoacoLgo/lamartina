/**
 * CAPAS DEL MAPA
 * Satélite: imágenes de Esri World Imagery (se pueden usar con atribución visible y bajo las condiciones de Esri;
 *           revisarlas antes de lanzar una versión comercial: https://www.esri.com/en-us/legal/terms/full-master-agreement).
 * Calles:   OpenStreetMap (uso liviano con atribución; para mucho tráfico conviene un proveedor con clave propia).
 * Para cambiar de proveedor alcanza con reemplazar estas direcciones.
 */
export const TILE_LAYERS = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
  },
  map: {
    url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap · © CARTO',
    maxZoom: 19,
  },
} as const;

export type MapLayer = keyof typeof TILE_LAYERS;

/** Colores de lo que se dibuja encima (los mismos que en el plano del club: predio rojo, camino azul). */
export const MAP_COLORS = {
  gate: '#1f9d55',
  route: '#2f6bff',
  predio: '#e53935',
  me: '#f57c00', //   naranja: distinto del azul del camino
} as const;
