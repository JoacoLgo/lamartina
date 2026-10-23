import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, space } from '@/theme';

interface Props {
  children: ReactNode;
  /** Barra fija abajo (botones de acción). */
  footer?: ReactNode;
}

/** Contenedor de pantalla: fondo, scroll, márgenes y respeto de la zona segura (notch / barra de gestos). */
export function Screen({ children, footer }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: footer ? space.lg : space.xl + insets.bottom },
        ]}>
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>{footer}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.creamLight },
  content: { padding: space.md, gap: space.md },
  footer: {
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    gap: space.sm,
  },
});
