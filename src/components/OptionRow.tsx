import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, TOUCH, type } from '@/theme';

interface Props {
  title: string;
  subtitle?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/** Fila seleccionable tipo "radio": elegir formato de juego, etc. */
export function OptionRow({ title, subtitle, selected, disabled = false, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, selected && styles.rowSelected, disabled && styles.disabled]}>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.dot} /> : null}
      </View>
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={type.small}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  rowSelected: { borderColor: colors.forest, backgroundColor: '#F4F0E3' },
  disabled: { opacity: 0.45 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.forest },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.forest },
  texts: { flex: 1, gap: 2 },
  title: { ...type.body, fontWeight: '600' },
});
