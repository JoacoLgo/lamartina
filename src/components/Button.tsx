import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import type { IconName } from '@/components/icons';
import { colors, radius, TOUCH } from '@/theme';

type Variant = 'primary' | 'secondary' | 'gold' | 'danger' | 'ghost';
type Size = 'md' | 'sm';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  /** Si es true, el botón se ajusta al ancho de su texto en vez de ocupar todo el renglón. */
  compact?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

const TEXT_COLOR: Record<Variant, string> = {
  primary: colors.cream,
  secondary: colors.forest,
  gold: colors.forestDeep,
  danger: '#FFFFFF',
  ghost: colors.forest,
};

/** Botón de acción. `primary` (verde del logo) es la acción principal de cada pantalla. */
export function Button({ label, onPress, variant = 'primary', size = 'md', compact = false, disabled = false, icon, style }: Props) {
  const color = TEXT_COLOR[variant];
  const isSmall = size === 'sm' || compact;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        isSmall && styles.baseSmall,
        compact && styles.compact,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      {icon ? <Ionicons name={icon} size={isSmall ? 17 : 20} color={color} /> : null}
      <Text numberOfLines={1} style={[styles.label, isSmall && styles.labelSmall, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH + 4,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  baseSmall: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.sm + 2,
    gap: 6,
  },
  compact: {
    alignSelf: 'flex-start',
  },
  primary: { backgroundColor: colors.forest, borderWidth: 1.5, borderColor: colors.gold },
  secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.forest },
  gold: { backgroundColor: colors.goldLight, borderWidth: 1.5, borderColor: colors.gold },
  danger: { backgroundColor: colors.bad },
  ghost: { backgroundColor: 'transparent' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  label: { fontSize: 16, fontWeight: '700' },
  labelSmall: { fontSize: 14, fontWeight: '700' },
});
