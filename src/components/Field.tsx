import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, TOUCH, type } from '@/theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
}

/** Campo de formulario: etiqueta arriba, mensaje de error abajo. Con `secureTextEntry` suma el botón para ver/ocultar clave. */
export function Field({ label, error, hint, secureTextEntry, style, ...rest }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      <View style={styles.row}>
        <TextInput
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          {...rest}
          secureTextEntry={secureTextEntry && !shown}
          style={[
            styles.input,
            error ? styles.inputError : null,
            style,
            secureTextEntry ? styles.inputWithToggle : null,
          ]}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onPress={() => setShown((s) => !s)}
            hitSlop={6}
            style={styles.toggle}>
            <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.goldDark} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={type.small}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 5, width: '100%', minWidth: 0 },
  label: { fontSize: 13.5, lineHeight: 18, fontWeight: '700', color: colors.forest },
  row: { position: 'relative', flexDirection: 'row', alignItems: 'center', width: '100%', minWidth: 0 },
  input: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  inputWithToggle: { paddingRight: 34 },
  inputError: { borderColor: colors.bad },
  toggle: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.bad, fontSize: 12.5, fontWeight: '600' },
});
