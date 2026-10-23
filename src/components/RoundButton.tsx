import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/theme';

interface Props {
  symbol: '+' | '−';
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  /** `solid` para la acción principal (+ patada), `outline` para la secundaria. */
  tone?: 'solid' | 'outline';
}

/** Botón circular para sumar o restar. Grande a propósito: se toca con una mano y con sol. */
export function RoundButton({ symbol, onPress, accessibilityLabel, size = 60, tone = 'solid' }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        tone === 'solid' ? styles.solid : styles.outline,
        pressed && { opacity: 0.8 },
      ]}>
      <Text style={[styles.symbol, { fontSize: size * 0.5 }, tone === 'outline' && styles.symbolOutline]}>
        {symbol}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  solid: { backgroundColor: colors.forest, borderWidth: 1.5, borderColor: colors.gold },
  outline: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.forest },
  symbol: { color: colors.cream, fontWeight: '600' },
  symbolOutline: { color: colors.forest },
});
