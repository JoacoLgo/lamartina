import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { LatLng, VenueConfig } from '@/domain/config';
import type { MapLayer } from '@/config/map';
import { mapsSearchUrl, openUrl } from '@/lib/maps';
import { colors, radius, type } from '@/theme';

export interface MapRouteProps {
  venue: VenueConfig;
  position?: LatLng | null;
  accuracyM?: number | null;
  layer?: MapLayer;
  onLayerChange?: (layer: MapLayer) => void;
  /** Qué se está dibujando (solo el administrador). */
  editing?: 'gate' | 'route' | 'predio' | null;
  onPick?: (point: LatLng) => void;
  /** Cada vez que cambia este número, el mapa se vuelve a encuadrar. */
  fitSignal?: number;
  height?: number;
}

/**
 * Mapa en el CELULAR (por ahora): tarjeta que abre la app de mapas.
 * El mapa interactivo con el camino dibujado funciona hoy en el navegador (MapRoute.web.tsx);
 * para el celular se puede sumar un mapa nativo (react-native-maps) más adelante.
 */
export function MapRoute({ venue, height = 240 }: MapRouteProps) {
  const query = venue.gate ? `${venue.gate.lat},${venue.gate.lng}` : venue.mapsQuery;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Abrir el mapa"
      onPress={() => query && openUrl(mapsSearchUrl(query))}
      style={[styles.box, { height }]}>
      <Ionicons name="map-outline" size={44} color={colors.forest} />
      <Text style={type.h2}>Ver en el mapa</Text>
      <Text style={type.small}>Se abre en tu app de mapas</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
