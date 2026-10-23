import { createElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

/**
 * Mapa en el NAVEGADOR: mapa de Google dentro de la pantalla (iframe).
 * Usa el modo "embed" por búsqueda, que no necesita clave de API.
 */
export function MapEmbed({ query, height = 220 }: { query: string; height?: number }) {
  const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed&z=15`;
  return (
    <View style={[styles.box, { height }]}>
      {createElement('iframe', {
        src,
        title: 'Mapa de La Martina',
        loading: 'lazy',
        referrerPolicy: 'no-referrer-when-downgrade',
        style: { border: 0, width: '100%', height: '100%' },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cream,
  },
});
