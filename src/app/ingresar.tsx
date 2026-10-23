import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { errorMessage } from '@/lib/api';
import { login } from '@/sync/engine';
import { colors, space, type } from '@/theme';

/** Iniciar sesión: usuario y contraseña. Si ya te sumaron a una ronda, te lleva directo ahí. */
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
    <Screen footer={<Button label={busy ? 'Entrando…' : 'Entrar'} icon="log-in-outline" onPress={submit} disabled={busy} />}>
      <View style={styles.intro}>
        <Text style={type.title}>¡Qué bueno verte!</Text>
        <Text style={type.body}>Entrá con tu usuario para sumar tus rondas al ranking y ver tus estadísticas.</Text>
      </View>

      <Card>
        <Field label="Usuario" value={username} onChangeText={setUsername} placeholder="tu usuario" autoComplete="username" returnKeyType="next" />
        <Field
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          placeholder="tu contraseña"
          secureTextEntry
          autoComplete="current-password"
          onSubmitEditing={submit}
          error={error}
        />
      </Card>

      <Text style={type.small}>Si te olvidaste la contraseña, pedile al administrador de la cancha que te la restablezca.</Text>

      <Pressable accessibilityRole="link" onPress={() => router.replace('/registro')}>
        <Text style={styles.link}>¿Todavía no tenés perfil? Crealo acá</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm },
  link: { color: colors.goldDark, fontWeight: '700', fontSize: 15, textDecorationLine: 'underline', paddingVertical: 6 },
});
