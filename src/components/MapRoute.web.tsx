import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MAP_COLORS, TILE_LAYERS, type MapLayer } from '@/config/map';
import type { LatLng } from '@/domain/config';
import { colors, radius, shadow } from '@/theme';
import type { MapRouteProps } from './MapRoute';

const ll = (p: LatLng): L.LatLngTuple => [p.lat, p.lng];

function ensureLeafletCssFix() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('leaflet-rnw-fix')) return;
  const style = document.createElement('style');
  style.id = 'leaflet-rnw-fix';
  style.textContent = `
    .leaflet-container {
      width: 100% !important;
      height: 100% !important;
      z-index: 1;
      background: #14261B !important;
    }
    .leaflet-container img.leaflet-tile {
      mix-blend-mode: normal !important;
      max-width: none !important;
      max-height: none !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * MAPA INTERACTIVO (Leaflet, versión navegador)
 * Dibuja encima de la imagen satelital: la tranquera (punto verde), el camino (línea azul
 * punteada), el predio (área roja) y la posición de la persona (punto naranja con su margen de error).
 * Con `editing` el administrador toca el mapa para marcar cada cosa.
 */
export function MapRoute({
  venue,
  position,
  accuracyM,
  layer: controlledLayer,
  onLayerChange,
  editing = null,
  onPick,
  fitSignal = 0,
  height = 320,
}: MapRouteProps) {
  const [internalLayer, setInternalLayer] = useState<MapLayer>('satellite');
  const layer = controlledLayer ?? internalLayer;
  const handleLayerChange = onLayerChange ?? setInternalLayer;

  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const overlays = useRef<L.LayerGroup | null>(null);
  const me = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  const editingRef = useRef(editing);
  const venueRef = useRef(venue);
  const positionRef = useRef(position);
  onPickRef.current = onPick;
  editingRef.current = editing;
  venueRef.current = venue;
  positionRef.current = position;

  const fitMapToVenue = useCallback(() => {
    const m = map.current;
    const container = el.current;
    if (!m || !container) return;
    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    m.invalidateSize({ pan: false });
    const v = venueRef.current;
    const pos = positionRef.current;
    const points: L.LatLngTuple[] = [...v.route, ...v.predio].map(ll);
    if (v.gate) points.push(ll(v.gate));
    if (pos) points.push(ll(pos));
    if (points.length === 0) return;
    if (points.length === 1) {
      m.setView(points[0], 16, { animate: false });
    } else {
      m.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 17, animate: false });
    }
  }, []);

  // Crear el mapa una sola vez y observar cambios de tamaño del contenedor
  useEffect(() => {
    ensureLeafletCssFix();
    const container = el.current;
    if (!container || map.current) return;

    const center: L.LatLngTuple = venue.gate ? ll(venue.gate) : [-38.8857, -62.0292];
    const m = L.map(container, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    }).setView(center, 15);

    m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');

    const cfg = TILE_LAYERS[layer];
    tiles.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
      crossOrigin: true,
    }).addTo(m);

    overlays.current = L.layerGroup().addTo(m);
    me.current = L.layerGroup().addTo(m);

    m.on('click', (e: L.LeafletMouseEvent) => {
      if (editingRef.current) onPickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    map.current = m;
    fitMapToVenue();

    const t1 = setTimeout(fitMapToVenue, 80);
    const t2 = setTimeout(fitMapToVenue, 250);
    const t3 = setTimeout(fitMapToVenue, 550);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        if (!editingRef.current) {
          fitMapToVenue();
        } else {
          m.invalidateSize({ pan: false });
        }
      });
      ro.observe(container);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      ro?.disconnect();
      tiles.current = null;
      overlays.current = null;
      me.current = null;
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Imagen de fondo (satélite o calles)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    tiles.current?.remove();
    const cfg = TILE_LAYERS[layer];
    tiles.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
      crossOrigin: true,
    }).addTo(m);
    tiles.current.bringToBack();
  }, [layer]);

  // Dibujo del lugar (predio en rojo, camino en azul con borde blanco, tranquera en verde)
  useEffect(() => {
    const group = overlays.current;
    if (!group) return;
    group.clearLayers();
    if (venue.predio.length >= 2) {
      L.polygon(venue.predio.map(ll), {
        color: MAP_COLORS.predio,
        weight: 3,
        fillColor: MAP_COLORS.predio,
        fillOpacity: 0.16,
      }).addTo(group);
    }
    if (venue.route.length >= 2) {
      L.polyline(venue.route.map(ll), { color: '#ffffff', weight: 8, opacity: 0.8 }).addTo(group);
      L.polyline(venue.route.map(ll), { color: MAP_COLORS.route, weight: 4, dashArray: '8 8' }).addTo(group);
    }
    if (editing === 'route') {
      venue.route.forEach((p) =>
        L.circleMarker(ll(p), {
          radius: 5,
          color: '#fff',
          weight: 2,
          fillColor: MAP_COLORS.route,
          fillOpacity: 1,
        }).addTo(group),
      );
    }
    if (editing === 'predio') {
      venue.predio.forEach((p) =>
        L.circleMarker(ll(p), {
          radius: 5,
          color: '#fff',
          weight: 2,
          fillColor: MAP_COLORS.predio,
          fillOpacity: 1,
        }).addTo(group),
      );
    }
    if (venue.gate) {
      L.circleMarker(ll(venue.gate), {
        radius: 10,
        color: '#ffffff',
        weight: 3,
        fillColor: MAP_COLORS.gate,
        fillOpacity: 1,
      })
        .bindTooltip(venue.gateLabel || 'Tranquera', { permanent: true, direction: 'top', offset: [0, -8] })
        .addTo(group);
    }
  }, [venue, editing]);

  // Posición de la persona
  useEffect(() => {
    const group = me.current;
    if (!group) return;
    group.clearLayers();
    if (!position) return;
    if (accuracyM && accuracyM > 0) {
      L.circle(ll(position), {
        radius: accuracyM,
        color: MAP_COLORS.me,
        weight: 1,
        fillColor: MAP_COLORS.me,
        fillOpacity: 0.12,
      }).addTo(group);
    }
    L.circleMarker(ll(position), {
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: MAP_COLORS.me,
      fillOpacity: 1,
    })
      .bindTooltip('Vos', { direction: 'top', offset: [0, -6] })
      .addTo(group);
  }, [position, accuracyM]);

  // Encuadrar cuando cambian los puntos desde el servidor o se toca "Encuadrar" / "Centrar"
  const geometryKey = editing
    ? `editando-${fitSignal}`
    : `${venue.gate?.lat},${venue.gate?.lng},${venue.route.length},${venue.predio.length},${fitSignal}`;
  useEffect(() => {
    if (editing && fitSignal === 0) return;
    fitMapToVenue();
    const t = setTimeout(fitMapToVenue, 200);
    return () => clearTimeout(t);
  }, [geometryKey, editing, fitSignal, fitMapToVenue]);

  useEffect(() => {
    if (el.current) el.current.style.cursor = editing ? 'crosshair' : '';
  }, [editing]);

  return (
    <View style={[styles.box, { height }]}>
      {createElement('div', {
        ref: el,
        style: {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: '#14261B',
        },
      })}
      <View style={styles.layerSwitch}>
        {(['satellite', 'map'] as MapLayer[]).map((opt) => {
          const active = layer === opt;
          return (
            <Pressable
              key={opt}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => handleLayerChange(opt)}
              style={[styles.layerBtn, active && styles.layerBtnActive]}>
              <Text style={[styles.layerText, active && styles.layerTextActive]}>
                {opt === 'satellite' ? 'Satélite' : 'Mapa'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cream,
  },
  layerSwitch: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1000,
    flexDirection: 'row',
    padding: 3,
    gap: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10, 32, 20, 0.88)',
    borderWidth: 1,
    borderColor: colors.gold,
    ...shadow,
  },
  layerBtn: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
  },
  layerBtnActive: {
    backgroundColor: colors.goldLight,
  },
  layerText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.cream,
  },
  layerTextActive: {
    color: colors.forestDeep,
  },
});
