import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, TOUCH, type } from '@/theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
}

/** Campo de formulario: etiqueta arriba, mensaje de error abajo. Con `secureTextEntry` suma el botón "Mostrar". */
export function Field({ label, error, hint, secureTextEntry, style, ...rest }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <TextInput
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          {...rest}
          secureTextEntry={secureTextEntry && !shown}
          style={[styles.input, error ? styles.inputError : null, style]}
        />
        {secureTextEntry ? (
          <Pressable accessibilityRole="button" onPress={() => setShown((s) => !s)} style={styles.toggle}>
            <Text style={styles.toggleText}>{shown ? 'Ocultar' : 'Mostrar'}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={type.small}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 14, fontWeight: '700', color: colors.forest },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  inputError: { borderColor: colors.bad },
  toggle: { position: 'absolute', right: 6, paddingHorizontal: 10, minHeight: 40, justifyContent: 'center' },
  toggleText: { color: colors.goldDark, fontWeight: '700', fontSize: 13 },
  error: { color: colors.bad, fontSize: 13, fontWeight: '600' },
});
