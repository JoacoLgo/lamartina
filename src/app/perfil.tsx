import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { formatToPar } from '@/domain/scoring';
import { api, avatarUrl, errorMessage } from '@/lib/api';
import { pickAvatar } from '@/lib/pickAvatar';
import { useAppStore, type Me } from '@/store/useAppStore';
import { logout } from '@/sync/engine';
import { colors, fonts, radius, space, type } from '@/theme';

interface MeRanking {
  position: number | null;
  total: number;
  stats: { rounds: number; bestStrokes: number; bestToPar: number; avgToPar: number; aces: number } | null;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={type.small}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export default function ProfileScreen() {
  const me = useAppStore((s) => s.me);
  if (!me) return <Redirect href="/ingresar" />;
  return <Profile me={me} />;
}

function Profile({ me }: { me: Me }) {
  const router = useRouter();
  const token = useAppStore((s) => s.token);
  const setMe = useAppStore((s) => s.setMe);
  const [ranking, setRanking] = useState<MeRanking | null>(null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [nickname, setNickname] = useState(me.nickname ?? '');
  const [pw, setPw] = useState({ current: '', next: '', open: false });

  const loadStats = useCallback(async () => {
    try {
      const res = await api<{ ranking: MeRanking | null }>('GET', '/me', { token });
      setRanking(res.ranking);
    } catch {
      // sin conexión: se muestra lo que haya
    }
  }, [token]);
  useEffect(() => void loadStats(), [loadStats]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ text: ok });
    } catch (e) {
      setMessage({ text: errorMessage(e), bad: true });
    }
  };

  const changePhoto = () =>
    run(async () => {
      const image = await pickAvatar();
      if (!image) return;
      const res = await api<{ user: Me }>('PUT', '/me/avatar', { token, body: { image } });
      setMe(res.user);
    }, 'Foto actualizada.');

  const removePhoto = () =>
    run(async () => {
      const res = await api<{ user: Me }>('DELETE', '/me/avatar', { token });
      setMe(res.user);
    }, 'Foto quitada.');

  const saveNickname = () =>
    run(async () => {
      const res = await api<{ user: Me }>('PATCH', '/me', { token, body: { nickname } });
      setMe(res.user);
    }, 'Apodo guardado.');

  const changePassword = () =>
    run(async () => {
      await api('POST', '/me/password', { token, body: { current: pw.current, next: pw.next } });
      setPw({ current: '', next: '', open: false });
    }, 'Contraseña cambiada.');

  const stats = ranking?.stats;

  return (
    <Screen>
      <Card style={styles.heroCard}>
        <Avatar name={me.displayName} id={me.id} uri={avatarUrl(me.id, me.avatarV)} size={92} />
        <Text style={type.title}>{me.displayName}</Text>
        <Text style={type.small}>
          @{me.username}
          {me.nickname ? ` · ${me.name}` : ''}
        </Text>
        <Text style={type.label}>{me.role === 'admin' ? 'Administrador' : 'Jugador registrado'}</Text>
        <View style={styles.photoButtons}>
          <Button label={me.avatarV ? 'Cambiar foto' : 'Agregar foto'} variant="secondary" icon="camera-outline" onPress={changePhoto} style={styles.flex} />
          {me.avatarV ? <Button label="Quitar" variant="ghost" onPress={removePhoto} /> : null}
        </View>
      </Card>

      {message ? <Text style={[styles.message, message.bad && { color: colors.bad }]}>{message.text}</Text> : null}

      {stats ? (
        <>
          <View style={styles.grid}>
            <Stat label="Tu puesto" value={ranking?.position ? `#${ranking.position}` : '–'} sub={ranking ? `de ${ranking.total}` : undefined} />
            <Stat label="Rondas completas" value={String(stats.rounds)} />
          </View>
          <View style={styles.grid}>
            <Stat label="Mejor ronda" value={String(stats.bestStrokes)} sub={formatToPar(stats.bestToPar)} />
            <Stat label="Promedio al par" value={`${stats.avgToPar > 0 ? '+' : ''}${stats.avgToPar.toFixed(1)}`} />
          </View>
          <View style={styles.grid}>
            <Stat label="Hoyos en uno" value={String(stats.aces)} />
          </View>
        </>
      ) : (
        <Card>
          <Text style={type.h2}>Todavía no estás en el ranking</Text>
          <Text style={type.body}>Completá una ronda entera con tu perfil para aparecer y ver tus estadísticas.</Text>
          <Button label="Empezar a jugar" icon="football-outline" onPress={() => router.push('/ronda/nueva')} />
        </Card>
      )}

      {me.role === 'admin' ? <Button label="Administración de la cancha" variant="secondary" icon="settings-outline" onPress={() => router.push('/admin')} /> : null}

      <Card>
        <Text style={type.h2}>Mis datos</Text>
        <Field label="Apodo" value={nickname} onChangeText={setNickname} autoCapitalize="words" placeholder="Cómo querés que te vean" />
        <Button label="Guardar apodo" variant="secondary" onPress={saveNickname} />
      </Card>

      <Card>
        <Text style={type.h2}>Contraseña</Text>
        {pw.open ? (
          <>
            <Field label="Contraseña actual" value={pw.current} onChangeText={(t) => setPw({ ...pw, current: t })} secureTextEntry />
            <Field label="Contraseña nueva" value={pw.next} onChangeText={(t) => setPw({ ...pw, next: t })} secureTextEntry hint="Mínimo 6 caracteres. Se cierra la sesión en tus otros celulares." />
            <Button label="Cambiar contraseña" onPress={changePassword} disabled={pw.current.length === 0 || pw.next.length < 6} />
          </>
        ) : (
          <Button label="Cambiar contraseña" variant="secondary" icon="key-outline" onPress={() => setPw({ ...pw, open: true })} />
        )}
      </Card>

      <Button
        label="Cerrar sesión"
        variant="ghost"
        onPress={async () => {
          await logout();
          router.replace('/');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heroCard: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  photoButtons: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch', marginTop: space.sm },
  message: { ...type.small, textAlign: 'center', color: colors.good, fontSize: 14 },
  grid: { flexDirection: 'row', gap: space.md },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statValue: { fontFamily: fonts.serif, fontSize: 32, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  statSub: { fontSize: 13, fontWeight: '700', color: colors.goldDark },
});
