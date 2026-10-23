import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { errorMessage } from '@/lib/api';
import { pickAvatar } from '@/lib/pickAvatar';
import { register } from '@/sync/engine';
import { colors, space, type } from '@/theme';

/** Crear perfil: nombre, apodo (opcional), usuario, contraseña y foto (opcional). */
export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = 'Escribí tu nombre y apellido.';
    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(username.trim())) e.username = 'De 3 a 20 caracteres: letras, números, punto o guión bajo.';
    if (password.length < 6) e.password = 'Mínimo 6 caracteres.';
    if (repeat !== password) e.repeat = 'Las contraseñas no coinciden.';
    return e;
  };

  const choosePhoto = async () => {
    try {
      const photo = await pickAvatar();
      if (photo) setAvatar(photo);
    } catch (e) {
      setErrors((prev) => ({ ...prev, photo: errorMessage(e) }));
    }
  };

  const submit = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await register({ username: username.trim(), name: name.trim(), nickname: nickname.trim() || undefined, password, avatar });
      router.replace('/');
    } catch (e) {
      setErrors({ form: errorMessage(e) });
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button label={busy ? 'Creando…' : 'Crear mi perfil'} icon="person-add-outline" onPress={submit} disabled={busy} />}>
      <View style={styles.intro}>
        <Text style={type.title}>Tu perfil</Text>
        <Text style={type.body}>
          Con tu perfil tus rondas suman al ranking y podés entrar desde cualquier celular. Tu contraseña es la que evita que otra
          persona juegue o cambie cosas en tu nombre.
        </Text>
      </View>

      <View style={styles.photoRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Elegir foto" onPress={choosePhoto}>
          <Avatar name={nickname || name || '?'} id={username || 'nuevo'} uri={avatar} size={84} />
        </Pressable>
        <View style={styles.flex}>
          <Button label={avatar ? 'Cambiar foto' : 'Agregar foto'} variant="secondary" icon="camera-outline" onPress={choosePhoto} />
          <Text style={type.small}>Opcional. Se ve chiquita en el ranking.</Text>
          {errors.photo ? <Text style={styles.error}>{errors.photo}</Text> : null}
        </View>
      </View>

      <Card>
        <Field label="Nombre y apellido" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Martín Gómez" error={errors.name} />
        <Field label="Apodo (opcional)" value={nickname} onChangeText={setNickname} autoCapitalize="words" placeholder="Tincho" hint="Es el que se ve en el ranking. Si no ponés, se ve tu nombre." />
        <Field label="Usuario" value={username} onChangeText={setUsername} placeholder="tincho10" autoComplete="username" error={errors.username} hint="Con este usuario entrás desde cualquier celular." />
        <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry placeholder="mínimo 6 caracteres" autoComplete="new-password" error={errors.password} />
        <Field label="Repetí la contraseña" value={repeat} onChangeText={setRepeat} secureTextEntry placeholder="la misma de arriba" autoComplete="new-password" error={errors.repeat} onSubmitEditing={submit} />
        {errors.form ? <Text style={styles.error}>{errors.form}</Text> : null}
      </Card>

      <Pressable accessibilityRole="link" onPress={() => router.replace('/ingresar')}>
        <Text style={styles.link}>¿Ya tenés perfil? Iniciá sesión</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 6 },
  intro: { gap: space.sm },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  error: { color: colors.bad, fontSize: 13, fontWeight: '600' },
  link: { color: colors.goldDark, fontWeight: '700', fontSize: 15, textDecorationLine: 'underline', paddingVertical: 6 },
});
