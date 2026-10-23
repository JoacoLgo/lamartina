import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createElement, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MAP_COLORS, TILE_LAYERS, type MapLayer } from '@/config/map';
import type { LatLng } from '@/domain/config';
import { colors, radius, shadow } from '@/theme';
import type { MapRouteProps } from './MapRoute';

const ll = (p: LatLng): L.LatLngTuple => [p.lat, p.lng];

/**
 * MAPA INTERACTIVO (Leaflet, versión navegador)
 * Dibuja encima de la imagen satelital: la tranquera (punto verde), el camino (línea azul
 * punteada), el predio (área roja) y la posición de la persona (punto azul con su margen de error).
 * Con `editing` el administrador toca el mapa para marcar cada cosa.
 */
export function MapRoute({
  venue,
  position,
  accuracyM,
  layer = 'satellite',
  onLayerChange,
  editing = null,
  onPick,
  fitSignal = 0,
  height = 320,
}: MapRouteProps) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const overlays = useRef<L.LayerGroup | null>(null);
  const me = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  const editingRef = useRef(editing);
  onPickRef.current = onPick;
  editingRef.current = editing;

  // Crear el mapa una sola vez
  useEffect(() => {
    if (!el.current || map.current) return;
    const center: L.LatLngTuple = venue.gate ? ll(venue.gate) : [-38.8857, -62.0292];
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(center, 15);
    m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>'); // sin la bandera del prefijo por defecto
    overlays.current = L.layerGroup().addTo(m);
    me.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (editingRef.current) onPickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    map.current = m;
    const t = setTimeout(() => m.invalidateSize(), 150); // por si el contenedor todavía no tenía su tamaño final
    return () => {
      clearTimeout(t);
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Imagen de fondo (satélite o calles)
  useEffect(() => {
    if (!map.current) return;
    tiles.current?.remove();
    const cfg = TILE_LAYERS[layer];
    tiles.current = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom }).addTo(map.current);
    tiles.current.bringToBack();
  }, [layer]);

  // Dibujo del lugar
  useEffect(() => {
    const group = overlays.current;
    if (!group) return;
    group.clearLayers();
    if (venue.predio.length >= 2) {
      L.polygon(venue.predio.map(ll), { color: MAP_COLORS.predio, weight: 3, fillColor: MAP_COLORS.predio, fillOpacity: 0.1 }).addTo(group);
    }
    if (venue.route.length >= 2) {
      L.polyline(venue.route.map(ll), { color: '#ffffff', weight: 8, opacity: 0.7 }).addTo(group); // borde blanco para que se vea sobre la imagen
      L.polyline(venue.route.map(ll), { color: MAP_COLORS.route, weight: 4, dashArray: '8 8' }).addTo(group);
    }
    if (editing === 'route') venue.route.forEach((p) => L.circleMarker(ll(p), { radius: 5, color: '#fff', weight: 2, fillColor: MAP_COLORS.route, fillOpacity: 1 }).addTo(group));
    if (editing === 'predio') venue.predio.forEach((p) => L.circleMarker(ll(p), { radius: 5, color: '#fff', weight: 2, fillColor: MAP_COLORS.predio, fillOpacity: 1 }).addTo(group));
    if (venue.gate) {
      L.circleMarker(ll(venue.gate), { radius: 10, color: '#ffffff', weight: 3, fillColor: MAP_COLORS.gate, fillOpacity: 1 })
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
    if (accuracyM && accuracyM > 0)
      L.circle(ll(position), { radius: accuracyM, color: MAP_COLORS.me, weight: 1, fillColor: MAP_COLORS.me, fillOpacity: 0.12 }).addTo(group);
    L.circleMarker(ll(position), { radius: 8, color: '#ffffff', weight: 3, fillColor: MAP_COLORS.me, fillOpacity: 1 })
      .bindTooltip('Vos', { direction: 'top', offset: [0, -6] })
      .addTo(group);
  }, [position, accuracyM]);

  // Encuadrar: al abrir, cuando llegan/cambian el camino y el predio desde el servidor, y cada vez que cambia `fitSignal`.
  // Mientras el administrador dibuja (`editing`) no se reencuadra solo, para no mover el mapa en cada punto nuevo.
  const geometryKey = editing ? 'editando' : `${venue.gate?.lat},${venue.gate?.lng},${venue.route.length},${venue.predio.length}`;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const fit = () => {
      m.invalidateSize(); // el contenedor pudo cambiar de tamaño desde que se creó el mapa
      const points: L.LatLngTuple[] = [...venue.route, ...venue.predio].map(ll);
      if (venue.gate) points.push(ll(venue.gate));
      if (position) points.push(ll(position));
      if (points.length === 0) return;
      if (points.length === 1) m.setView(points[0], 16);
      else m.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 18 });
    };
    fit();
    const t = setTimeout(fit, 250); // segunda pasada por si el tamaño final llegó después
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal, geometryKey]);

  useEffect(() => {
    if (el.current) el.current.style.cursor = editing ? 'crosshair' : '';
  }, [editing]);

  return (
    <View style={[styles.box, { height }]}>
      {createElement('div', { ref: el, style: { width: '100%', height: '100%', background: colors.cream } })}
      {onLayerChange ? (
        <View style={styles.layerSwitch}>
          {(['satellite', 'map'] as MapLayer[]).map((opt) => {
            const active = layer === opt;
            return (
              <Pressable
                key={opt}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => onLayerChange(opt)}
                style={[styles.layerBtn, active && styles.layerBtnActive]}>
                <Text style={[styles.layerText, active && styles.layerTextActive]}>
                  {opt === 'satellite' ? 'Satélite' : 'Mapa'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
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
