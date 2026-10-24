import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { errorMessage } from '@/lib/api';
import { login } from '@/sync/engine';
import { colors, fonts, radius, space } from '@/theme';

/** Iniciar sesión: diseño móvil compacto sin filas estiradas de punta a punta. */
export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('Completá tu usuario y tu contraseña.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { activeRoundId } = await login(username.trim(), password);
      router.replace(activeRoundId ? { pathname: '/ronda/[id]', params: { id: activeRoundId } } : '/');
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        {/* Cabecera compacta: Escudo a la izquierda + Bienvenida breve a la derecha */}
        <View style={styles.topHeader}>
          <Logo size={76} />
          <View style={styles.introCol}>
            <Text style={styles.kicker}>LA MARTINA FOOTGOLF</Text>
            <Text style={styles.titleText}>¡Qué bueno verte!</Text>
            <Text style={styles.introSub}>
              Ingresá con tu cuenta para sumar al ranking y ver toda tu trayectoria.
            </Text>
          </View>
        </View>

        {/* Tarjeta compacta con Usuario y Contraseña en dos columnas y botón centrado */}
        <Card style={styles.loginCard}>
          <View style={styles.twoCols}>
            <View style={styles.colHalf}>
              <Field
                label="Usuario"
                value={username}
                onChangeText={setUsername}
                placeholder="tu usuario"
                autoComplete="username"
                returnKeyType="next"
                style={styles.compactInput}
              />
            </View>
            <View style={styles.colHalf}>
              <Field
                label="Contraseña"
                value={password}
                onChangeText={setPassword}
                placeholder="tu clave"
                secureTextEntry
                autoComplete="current-password"
                onSubmitEditing={submit}
                style={styles.compactInput}
              />
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={busy ? 'Entrando…' : 'Entrar'}
            icon="log-in-outline"
            onPress={submit}
            disabled={busy}
            style={styles.submitBtn}
          />
        </Card>

        {/* Ayuda y acceso a registro */}
        <View style={styles.footerInfo}>
          <View style={styles.helpBox}>
            <Ionicons name="key-outline" size={15} color={colors.goldDark} />
            <Text style={styles.helpText}>
              ¿Olvidaste tu clave? Pedile al administrador en la cancha que la restablezca.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/registro')}
            style={({ pressed }) => [styles.registerBanner, pressed && { opacity: 0.88 }]}>
            <View style={styles.flex}>
              <Text style={styles.registerBannerTitle}>¿Todavía no tenés perfil?</Text>
              <Text style={styles.registerBannerSub}>Crealo en un minuto y empezá a ranquear</Text>
            </View>
            <View style={styles.registerActionPill}>
              <Text style={styles.registerActionText}>Crear perfil</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.forestDeep} />
            </View>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    gap: space.md,
    paddingTop: 4,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  introCol: {
    flex: 1,
    gap: 2,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: colors.goldDark,
  },
  titleText: {
    fontFamily: fonts.serif,
    fontSize: 23,
    fontWeight: '700',
    color: colors.ink,
  },
  introSub: {
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.muted,
  },
  loginCard: {
    padding: 14,
    gap: 12,
    borderColor: colors.gold,
    borderWidth: 1.5,
  },
  twoCols: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
  },
  colHalf: {
    flex: 1,
    minWidth: 0,
  },
  compactInput: {
    height: 44,
    minHeight: 44,
    paddingVertical: 0,
    paddingHorizontal: 11,
    fontSize: 14.5,
  },
  error: {
    color: colors.bad,
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  submitBtn: {
    alignSelf: 'center',
    paddingHorizontal: 36,
    minWidth: 190,
    borderRadius: radius.pill,
  },
  footerInfo: {
    gap: 10,
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.line,
  },
  helpText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
  registerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  registerBannerTitle: {
    fontFamily: fonts.serif,
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  registerBannerSub: {
    fontSize: 12,
    color: colors.muted,
  },
  registerActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.goldLight,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  registerActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.forestDeep,
  },
});
