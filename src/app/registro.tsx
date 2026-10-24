import { Ionicons } from '@expo/vector-icons';
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
import { colors, fonts, radius, space } from '@/theme';

/** Crear perfil: diseño compacto para celular con foto e introducción integradas arriba y campos en grilla. */
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
    if (name.trim().length < 2) e.name = 'Ingresá tu nombre.';
    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(username.trim())) e.username = '3 a 20 letras, números, punto o guión.';
    if (password.length < 6) e.password = 'Mín. 6 caracteres.';
    if (repeat !== password) e.repeat = 'No coinciden.';
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
    <Screen>
      {/* Cabecera compacta: Foto a la izquierda + Título y descripción breve a la derecha */}
      <View style={styles.topHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Elegir foto de perfil"
          onPress={choosePhoto}
          style={styles.photoCol}>
          <Avatar name={nickname || name || '?'} id={username || 'nuevo'} uri={avatar} size={64} />
          <View style={styles.photoPill}>
            <Ionicons name="camera-outline" size={13} color={colors.forest} />
            <Text style={styles.photoPillText}>{avatar ? 'Cambiar' : 'Agregar foto'}</Text>
          </View>
        </Pressable>

        <View style={styles.introCol}>
          <Text style={styles.titleText}>Tu perfil</Text>
          <Text style={styles.introSub}>
            Sumá tus rondas al ranking, seguí tu trayectoria y entrá desde cualquier celular con tu contraseña.
          </Text>
          {errors.photo ? <Text style={styles.error}>{errors.photo}</Text> : null}
        </View>
      </View>

      {/* Formulario compacto en grilla para celular */}
      <Card style={styles.formCard}>
        <View style={styles.twoCols}>
          <View style={styles.colName}>
            <Field
              label="Nombre y apellido"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="Martín Gómez"
              error={errors.name}
              style={styles.compactInput}
            />
          </View>
          <View style={styles.colNick}>
            <Field
              label="Apodo (opc.)"
              value={nickname}
              onChangeText={setNickname}
              autoCapitalize="words"
              placeholder="Tincho"
              style={styles.compactInput}
            />
          </View>
        </View>

        <Field
          label="Usuario (para iniciar sesión)"
          value={username}
          onChangeText={setUsername}
          placeholder="tincho10"
          autoComplete="username"
          error={errors.username}
          style={styles.compactInput}
        />

        <View style={styles.twoCols}>
          <View style={styles.colHalf}>
            <Field
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Mín. 6 caract."
              autoComplete="new-password"
              error={errors.password}
              style={styles.compactInput}
            />
          </View>
          <View style={styles.colHalf}>
            <Field
              label="Repetir clave"
              value={repeat}
              onChangeText={setRepeat}
              secureTextEntry
              placeholder="Igual a la anterior"
              autoComplete="new-password"
              error={errors.repeat}
              onSubmitEditing={submit}
              style={styles.compactInput}
            />
          </View>
        </View>

        {errors.form ? <Text style={styles.error}>{errors.form}</Text> : null}
      </Card>

      <View style={styles.actionsWrap}>
        <Button
          label={busy ? 'Creando…' : 'Crear mi perfil'}
          icon="person-add-outline"
          onPress={submit}
          disabled={busy}
          style={styles.submitBtn}
        />
        <Pressable accessibilityRole="link" onPress={() => router.replace('/ingresar')}>
          <Text style={styles.link}>¿Ya tenés perfil? Iniciá sesión</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: 2,
  },
  photoCol: {
    alignItems: 'center',
    gap: 5,
  },
  photoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  photoPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.forest,
  },
  introCol: {
    flex: 1,
    gap: 3,
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
  formCard: {
    padding: 13,
    gap: 10,
  },
  twoCols: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
  },
  colName: {
    flex: 1.25,
    minWidth: 0,
  },
  colNick: {
    flex: 0.85,
    minWidth: 0,
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
  actionsWrap: {
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  submitBtn: {
    alignSelf: 'center',
    paddingHorizontal: 32,
    minWidth: 215,
    borderRadius: radius.pill,
  },
  error: { color: colors.bad, fontSize: 12.5, fontWeight: '600' },
  link: { color: colors.goldDark, fontWeight: '700', fontSize: 14, textDecorationLine: 'underline', paddingVertical: 4 },
});
