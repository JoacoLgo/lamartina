import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { mapsSearchUrl, openUrl } from '@/lib/maps';
import { colors, radius, type } from '@/theme';

/**
 * Mapa en el CELULAR: una tarjeta que abre la app de mapas del teléfono.
 * (En el navegador se usa MapEmbed.web.tsx, que muestra el mapa dentro de la pantalla.
 * Cuando se publique la app se puede reemplazar por un mapa nativo embebido.)
 */
export function MapEmbed({ query, height = 220 }: { query: string; height?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Abrir el mapa"
      onPress={() => openUrl(mapsSearchUrl(query))}
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
