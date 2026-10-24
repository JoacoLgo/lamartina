import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { useHydrated } from '@/store/useAppStore';
import { bootstrap, syncTick } from '@/sync/engine';
import { colors, fonts } from '@/theme';

/**
 * Layout raíz: define la barra superior, las rutas y arranca la sincronización.
 *   src/app/index.tsx              -> "/"
 *   src/app/ranking.tsx            -> "/ranking"
 *   src/app/ronda/[id]/index.tsx   -> "/ronda/123" ([id] es un parámetro)
 *
 * El contenedor de afuera limita el ancho a "tamaño celular" y lo centra: así,
 * si se abre en la compu, se ve como una app de celular y no estirada.
 */
export default function RootLayout() {
  const hydrated = useHydrated();

  useEffect(() => {
    if (!hydrated) return;
    void bootstrap();
    // cada 4 segundos: manda lo pendiente y trae novedades (puntajes de otros celulares, invitaciones)
    const timer = setInterval(() => void syncTick(), 4000);
    return () => clearInterval(timer);
  }, [hydrated]);

  if (!hydrated) return null; // esperar a que carguen los datos guardados

  return (
    <View style={styles.outer}>
      <View style={styles.phone}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.forestDeep },
            headerTintColor: colors.cream,
            headerTitleStyle: { fontFamily: fonts.serif, fontWeight: '700', fontSize: 19 },
            headerShadowVisible: false,
            headerBackTitle: 'Atrás',
            contentStyle: { backgroundColor: colors.creamLight },
          }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="ingresar" options={{ title: 'Iniciar sesión' }} />
          <Stack.Screen name="registro" options={{ title: 'Crear mi perfil' }} />
          <Stack.Screen name="perfil" options={{ title: 'Mi perfil' }} />
          <Stack.Screen name="ronda/nueva" options={{ title: 'Nueva ronda' }} />
          <Stack.Screen name="ronda/[id]/index" options={{ title: 'Ronda' }} />
          <Stack.Screen name="ronda/[id]/resumen" options={{ title: 'Resumen' }} />
          <Stack.Screen name="ranking" options={{ title: 'Ranking' }} />
          <Stack.Screen name="historial" options={{ title: 'Mi trayectoria' }} />
          <Stack.Screen name="como-llegar" options={{ title: 'Cómo llegar' }} />
          <Stack.Screen name="reglas" options={{ title: 'Cómo se juega' }} />
          <Stack.Screen name="admin/index" options={{ title: 'Administración' }} />
        </Stack>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center', backgroundColor: colors.forestDeep },
  phone: { flex: 1, width: '100%', maxWidth: 480, backgroundColor: colors.creamLight },
});
