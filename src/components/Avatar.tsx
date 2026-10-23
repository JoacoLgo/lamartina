import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

const BACKGROUNDS = [colors.forest, colors.moss, colors.goldDark, '#3E5C4A', '#6B5535'];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Foto de perfil si hay (`uri`); si no, círculo con las iniciales. El color sale del id: cada persona siempre tiene el mismo. */
export function Avatar({ name, id, size = 40, uri }: { name: string; id: string; size?: number; uri?: string | null }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityLabel={`Foto de ${name}`}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.cream }}
      />
    );
  }
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: BACKGROUNDS[hash(id) % BACKGROUNDS.length] },
      ]}>
      <Text style={[styles.text, { fontSize: Math.round(size * 0.4) }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.cream, fontWeight: '700' },
});
