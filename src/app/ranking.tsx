import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Podium, type PodiumEntry } from '@/components/Podium';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { MIN_ROUNDS_FOR_AVERAGE } from '@/domain/constants';
import { MAX_COUNTED_CARDS } from '@/domain/ranking';
import { formatToPar } from '@/domain/scoring';
import { api, avatarUrl } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius, space, type } from '@/theme';

type Mode = 'individual' | 'duo';
type Period = 'today' | 'month' | 'all';
type Kind = 'best' | 'average' | 'points' | 'aces';

interface Person { userId: string; name: string; avatarV: number | null }
interface Stats { rounds: number; bestStrokes: number; bestToPar: number; avgToPar: number; points: number; aces: number }
interface IndEntry extends Stats, Person { position: number; tied: boolean }
interface DuoEntry { position: number; tied: boolean; key: string; members: Person[]; rounds: number; bestStrokes: number; bestToPar: number; avgToPar: number; points: number }
interface IndMe {
  position: number | null;
  total: number;
  stats: Stats | null;
  positions: { best: number | null; average: number | null; points: number | null; aces: number | null };
  totals: { best: number; average: number; points: number; aces: number };
}
type Data =
  | { mode: 'individual'; total: number; entries: IndEntry[]; me: IndMe | null }
  | { mode: 'duo'; total: number; entries: DuoEntry[]; me: { position: number | null; entry: DuoEntry | null } | null };

const MODES = [
  { value: 'individual' as const, label: 'Individual' },
  { value: 'duo' as const, label: 'Dúo' },
];
const PERIODS = [
  { value: 'today' as const, label: 'Hoy' },
  { value: 'month' as const, label: 'Este mes' },
  { value: 'all' as const, label: 'Histórico' },
];
const KINDS_IND = [
  { value: 'best' as const, label: 'Mejor' },
  { value: 'average' as const, label: 'Promedio' },
  { value: 'points' as const, label: 'Puntos Pro' },
  { value: 'aces' as const, label: 'En uno' },
];
const KINDS_DUO = KINDS_IND.slice(0, 3);
const PERIOD_TEXT: Record<Period, string> = { today: 'hoy', month: 'este mes', all: 'en total' };
const cache = new Map<string, Data>();

const avg = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

function mainValue(e: IndEntry | DuoEntry, kind: Kind): { big: string; small: string } {
  if (kind === 'best') return { big: String(e.bestStrokes), small: formatToPar(e.bestToPar) };
  if (kind === 'average') return { big: avg(e.avgToPar), small: 'al par' };
  if (kind === 'points') return { big: String(e.points ?? 0), small: 'pts AAFG' };
  const aces = (e as IndEntry).aces;
  return { big: String(aces), small: aces === 1 ? 'hoyo en uno' : 'hoyos en uno' };
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
      {sub ? <Text style={styles.miniSub}>{sub}</Text> : null}
    </View>
  );
}

export default function RankingScreen() {
  const router = useRouter();
  const token = useAppStore((s) => s.token);
  const me = useAppStore((s) => s.me);
  const [mode, setMode] = useState<Mode>('individual');
  const [period, setPeriod] = useState<Period>('all');
  const [kind, setKind] = useState<Kind>('best');
  const [data, setData] = useState<Data | null>(null);
  const [offline, setOffline] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showProInfo, setShowProInfo] = useState(false);

  const effectiveKind: Kind = mode === 'duo' && kind === 'aces' ? 'best' : kind;
  const queryKey = `${mode}|${effectiveKind}|${period}|${token ? 'u' : 'g'}`;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await api<Data>('GET', `/ranking?mode=${mode}&kind=${effectiveKind}&period=${period}`, { token });
        if (!alive) return;
        cache.set(queryKey, res);
        setData(res);
        setOffline(false);
      } catch {
        if (!alive) return;
        setData(cache.get(queryKey) ?? null);
        setOffline(true);
      }
    };
    setData(cache.get(queryKey) ?? null);
    void load();
    const timer = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [queryKey, mode, effectiveKind, period, token]);

  const entries = data?.entries ?? [];
  const isInd = data?.mode === 'individual';

  const podium: PodiumEntry[] = entries.slice(0, 3).map((e) => {
    const people: Person[] = 'members' in e ? (e as DuoEntry).members : [e as IndEntry];
    const v = mainValue(e, effectiveKind);
    return {
      id: 'members' in e ? (e as DuoEntry).key : (e as IndEntry).userId,
      position: e.position,
      people: people.map((p) => ({ id: p.userId, name: p.name, uri: avatarUrl(p.userId, p.avatarV) })),
      title: people.map((p) => p.name).join(' y '),
      value: v.big,
      sub: v.small,
    };
  });
  const rest = entries.slice(3);

  const emptyText =
    effectiveKind === 'average'
      ? `Cuando alguien complete ${MIN_ROUNDS_FOR_AVERAGE} rondas completas ${PERIOD_TEXT[period]}, aparece en esta tabla.`
      : mode === 'duo'
        ? `Todavía no hay dúos ${PERIOD_TEXT[period]}. Juegan dos jugadores registrados una ronda completa en modo Dúo y entran.`
        : `Todavía no hay nadie ${PERIOD_TEXT[period]}. Jugá una ronda completa con tu perfil y aparecés.`;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={type.label}>Ranking de la cancha</Text>
        <Text style={type.title}>Los mejores de La Martina</Text>
      </View>

      <Segmented options={MODES} value={mode} onChange={setMode} />
      <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      <Segmented options={mode === 'duo' ? KINDS_DUO : KINDS_IND} value={effectiveKind} onChange={setKind} />
      {offline ? <Text style={styles.offline}>Sin conexión: se muestra lo último que se pudo cargar.</Text> : null}

      {/* EXPLICACIÓN DEL SISTEMA PROFESIONAL FIFG / AAFG */}
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowProInfo((v) => !v)}
        style={styles.proInfoToggle}>
        <Ionicons name="information-circle-outline" size={18} color={colors.forest} />
        <Text style={styles.proInfoToggleText}>
          ¿Cómo se ranquea en el Footgolf Profesional (AAFG / FIFG)?
        </Text>
        <Ionicons name={showProInfo ? 'chevron-up' : 'chevron-down'} size={16} color={colors.forest} />
      </Pressable>

      {showProInfo ? (
        <Card style={styles.proInfoCard}>
          <Text style={type.h2}>Sistema Profesional vs. Cancha</Text>
          <Text style={type.small}>
            • <Text style={styles.bold}>Por tarjeta (Mejor ronda y Promedio):</Text> Igual que en los torneos de la{' '}
            <Text style={styles.bold}>FIFG y la AAFG</Text>, cada ronda se mide en formato <Text style={styles.bold}>Medal / Stroke Play respecto al Par</Text> de la cancha (ej. -2, E, +3). Si hay empate en una ronda, se desempata por <Text style={styles.bold}>Countback oficial</Text> (mejor Vuelta / últimos 9 hoyos IN, últimos 6, últimos 3 y último hoyo).
          </Text>
          <Text style={type.small}>
            • <Text style={styles.bold}>Puntos Pro (Escala del 92% AAFG):</Text> En el Ranking Argentino de Footgolf (AAFG), cada fecha jugada entrega puntos con la <Text style={styles.bold}>fórmula del 92%</Text> (el mejor recibe el 100% y cada escalón siguiente el 92% del anterior), sumando únicamente las <Text style={styles.bold}>mejores {MAX_COUNTED_CARDS} tarjetas</Text> de cada jugador. Así, jugar seguido suma hasta tu tope de mejores tarjetas sin que un mal día te baje el puntaje.
          </Text>
        </Card>
      ) : null}

      {/* TU POSICIÓN */}
      {!token ? (
        <Card style={styles.meCard}>
          <Text style={type.h2}>¿En qué puesto estás?</Text>
          <Text style={type.body}>Iniciá sesión para ver tu posición, tus puntos profesionales, promedio y estadísticas.</Text>
          <View style={styles.cta}>
            <Button label="Entrar" size="sm" onPress={() => router.push('/ingresar')} style={styles.flex} />
            <Button label="Crear perfil" variant="secondary" size="sm" onPress={() => router.push('/registro')} style={styles.flex} />
          </View>
        </Card>
      ) : data && isInd && data.me ? (
        <Card style={styles.meCard}>
          <Text style={type.label}>Tu posición · {PERIOD_TEXT[period]}</Text>
          {data.me.position ? (
            <View style={styles.meTop}>
              <Text style={styles.meBig}>#{data.me.position}</Text>
              <Text style={type.body}>
                de {data.me.total} {data.me.total === 1 ? 'jugador' : 'jugadores'}
              </Text>
            </View>
          ) : (
            <Text style={type.body}>
              {data.me.stats
                ? effectiveKind === 'average'
                  ? `Todavía no entrás en el promedio: hacen falta ${MIN_ROUNDS_FOR_AVERAGE} rondas completas (llevás ${data.me.stats.rounds}).`
                  : 'Todavía no estás en esta tabla.'
                : `No tenés rondas completas ${PERIOD_TEXT[period]}. Jugá una ronda entera para aparecer.`}
            </Text>
          )}
          {data.me.stats ? (
            <View style={styles.minis}>
              <Mini label="Mejor ronda" value={String(data.me.stats.bestStrokes)} sub={formatToPar(data.me.stats.bestToPar)} />
              <Mini label="Promedio" value={avg(data.me.stats.avgToPar)} sub="al par" />
              <Mini label="Puntos Pro" value={String(data.me.stats.points ?? 0)} sub="AAFG 92%" />
              <Mini label="Rondas" value={String(data.me.stats.rounds)} />
            </View>
          ) : null}
          <Text style={type.small}>
            Puestos: mejor {data.me.positions.best ? `#${data.me.positions.best}` : '–'} · promedio{' '}
            {data.me.positions.average ? `#${data.me.positions.average}` : '–'} · puntos pro{' '}
            {data.me.positions.points ? `#${data.me.positions.points}` : '–'} · en uno{' '}
            {data.me.positions.aces ? `#${data.me.positions.aces}` : '–'}
          </Text>
        </Card>
      ) : data && !isInd && data.me ? (
        <Card style={styles.meCard}>
          <Text style={type.label}>Tu mejor dupla · {PERIOD_TEXT[period]}</Text>
          {data.me.entry ? (
            <View style={styles.meTop}>
              <Text style={styles.meBig}>#{data.me.position}</Text>
              <Text style={type.body}>
                {data.me.entry.members.map((m) => m.name).join(' y ')} · {data.me.entry.bestStrokes} patadas ({formatToPar(data.me.entry.bestToPar)}) · {data.me.entry.points ?? 0} pts
              </Text>
            </View>
          ) : (
            <Text style={type.body}>Todavía no jugaste un dúo completo {PERIOD_TEXT[period]}. Los dos tienen que estar registrados.</Text>
          )}
        </Card>
      ) : null}

      {/* PODIO + LISTA */}
      {data && entries.length === 0 ? (
        <Card>
          <Ionicons name="trophy-outline" size={34} color={colors.goldDark} />
          <Text style={type.h2}>Todavía no hay nadie acá</Text>
          <Text style={type.body}>{emptyText}</Text>
        </Card>
      ) : null}

      {podium.length > 0 ? (
        <Card>
          <Podium entries={podium} />
        </Card>
      ) : null}

      {rest.length > 0 ? (
        <Card style={styles.list}>
          {rest.map((e, i) => {
            const id = 'members' in e ? (e as DuoEntry).key : (e as IndEntry).userId;
            const people: Person[] = 'members' in e ? (e as DuoEntry).members : [e as IndEntry];
            const v = mainValue(e, effectiveKind);
            const mine = !!me && people.some((p) => p.userId === me.id);
            const expanded = open === id;
            return (
              <View key={id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ver estadísticas de ${people.map((p) => p.name).join(' y ')}`}
                  onPress={() => setOpen(expanded ? null : id)}
                  style={[styles.row, i > 0 && styles.divider, mine && styles.mine]}>
                  <View style={styles.position}>
                    <Text style={styles.positionText}>{e.position}</Text>
                  </View>
                  <View style={styles.faces}>
                    {people.map((p, k) => (
                      <View key={p.userId} style={k > 0 && styles.overlap}>
                        <Avatar name={p.name} id={p.userId} uri={avatarUrl(p.userId, p.avatarV)} size={38} />
                      </View>
                    ))}
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.name} numberOfLines={1}>
                      {people.map((p) => p.name).join(' y ')}
                      {mine ? ' (vos)' : ''}
                    </Text>
                    <Text style={type.small}>
                      {e.rounds} {e.rounds === 1 ? 'ronda' : 'rondas'}
                    </Text>
                  </View>
                  <View style={styles.value}>
                    <Text style={styles.valueBig}>{v.big}</Text>
                    <Text style={type.small}>{v.small}</Text>
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                </Pressable>
                {expanded ? (
                  <View style={styles.detail}>
                    {people.length === 1 ? (
                      <Avatar name={people[0].name} id={people[0].userId} uri={avatarUrl(people[0].userId, people[0].avatarV)} size={64} />
                    ) : null}
                    <View style={styles.minis}>
                      <Mini label="Mejor ronda" value={String(e.bestStrokes)} sub={formatToPar(e.bestToPar)} />
                      <Mini label="Promedio" value={avg(e.avgToPar)} sub="al par" />
                      <Mini label="Puntos Pro" value={String(e.points ?? 0)} sub="AAFG" />
                      <Mini label="Rondas" value={String(e.rounds)} />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : null}

      <Text style={type.small}>
        Solo cuentan rondas completas de jugadores registrados.{mode === 'duo' ? ' Un dúo entra si los dos están registrados.' : ''}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: space.xs },
  offline: { ...type.small, textAlign: 'center', color: colors.goldDark },
  proInfoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  proInfoToggleText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.forest,
  },
  proInfoCard: {
    borderColor: colors.gold,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  bold: {
    fontWeight: '700',
    color: colors.ink,
  },
  cta: { flexDirection: 'row', gap: space.sm },
  meCard: { borderColor: colors.gold, borderWidth: 2, backgroundColor: colors.cream },
  meTop: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  meBig: { fontFamily: fonts.serif, fontSize: 52, fontWeight: '700', color: colors.forest },
  minis: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' },
  mini: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  miniValue: { fontFamily: fonts.serif, fontSize: 20, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  miniLabel: { fontSize: 11, color: colors.muted, fontWeight: '600', textAlign: 'center' },
  miniSub: { fontSize: 11, fontWeight: '700', color: colors.goldDark },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  mine: { backgroundColor: '#F4F0E3' },
  position: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.line },
  positionText: { fontSize: 14, fontWeight: '800', color: colors.muted, fontVariant: ['tabular-nums'] },
  faces: { flexDirection: 'row' },
  overlap: { marginLeft: -12 },
  name: { fontFamily: fonts.serif, fontSize: 17, fontWeight: '700', color: colors.ink },
  value: { alignItems: 'flex-end', minWidth: 58 },
  valueBig: { fontSize: 22, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  detail: { padding: space.md, gap: space.sm, alignItems: 'center', backgroundColor: colors.creamLight, borderTopWidth: 1, borderTopColor: colors.line },
});
