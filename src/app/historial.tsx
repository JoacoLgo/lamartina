import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { formatInfo } from '@/domain/formats';
import { formatToPar, leaderboard, playerTotals } from '@/domain/scoring';
import { playerStats, standingsText } from '@/domain/stats';
import type { Round } from '@/domain/types';
import { api } from '@/lib/api';
import { confirmAction } from '@/lib/dialogs';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius, space, type } from '@/theme';

type Filter = 'all' | 'individual' | 'duo';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function CounterBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.counterBox}>
      <Text style={styles.counterVal}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
      {sub ? <Text style={styles.counterSub}>{sub}</Text> : null}
    </View>
  );
}

/**
 * HISTORIAL DE PARTIDAS Y CONTADOR PERSONAL
 * Permite a quienes juegan a diario o están registrados llevar la cuenta de sus rondas,
 * patadas acumuladas, promedio, golpes bajo par y revisar cómo les fue en cada partida.
 */
export default function HistoryScreen() {
  const router = useRouter();
  const me = useAppStore((s) => s.me);
  const token = useAppStore((s) => s.token);
  const rounds = useAppStore((s) => s.rounds);
  const upsertRemoteRound = useAppStore((s) => s.upsertRemoteRound);
  const deleteRound = useAppStore((s) => s.deleteRound);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!me) {
      router.replace('/ingresar');
      return;
    }
    if (!token) return;
    api<{ rounds: Round[] }>('GET', '/me/rounds', { token })
      .then((res) => {
        for (const r of res.rounds) upsertRemoteRound(r);
      })
      .catch(() => undefined);
  }, [me, router, token, upsertRemoteRound]);

  const finished = useMemo(() => {
    if (!me) return [];
    return rounds
      .filter((r) => r.finishedAt && !r.demo && r.players.some((p) => p.profileId === me.id))
      .sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt));
  }, [me, rounds]);

  const filtered = useMemo(
    () =>
      finished.filter((r) => {
        if (filter === 'all') return true;
        const m = r.mode ?? 'individual';
        return m === filter;
      }),
    [finished, filter],
  );

  // Contador personal (toma al usuario logueado o al Jugador 1 si juega sin cuenta)
  const personalSummary = useMemo(() => {
    let totalRounds = 0;
    let totalKicks = 0;
    let totalHoles = 0;
    let bestToPar: number | null = null;
    let bestStrokes: number | null = null;
    let sumToPar = 0;
    let completedRounds = 0;
    let aces = 0;
    let birdiesOrBetter = 0;
    let pars = 0;
    let wins = 0;

    for (const r of finished) {
      const myPlayer = me
        ? r.players.find((p) => p.profileId === me.id) ?? r.players[0]
        : r.players[0];
      if (!myPlayer) continue;
      const t = playerTotals(r, myPlayer.id);
      if (t.holesPlayed === 0) continue;

      totalRounds += 1;
      totalKicks += t.strokes;
      totalHoles += t.holesPlayed;

      const st = playerStats(r, myPlayer.id);
      aces += st.counts['hole-in-one'];
      birdiesOrBetter += st.counts['hole-in-one'] + st.counts.albatross + st.counts.eagle + st.counts.birdie;
      pars += st.counts.par;

      if (r.players.length > 1) {
        const lb = leaderboard(r);
        if (lb[0]?.player.id === myPlayer.id) wins += 1;
      }

      if (t.holesPlayed === r.holes.length) {
        completedRounds += 1;
        sumToPar += t.toPar;
        if (bestToPar === null || t.toPar < bestToPar) {
          bestToPar = t.toPar;
          bestStrokes = t.strokes;
        }
      }
    }

    return {
      totalRounds,
      totalKicks,
      totalHoles,
      bestToPar,
      bestStrokes,
      avgToPar: completedRounds > 0 ? sumToPar / completedRounds : null,
      aces,
      birdiesOrBetter,
      pars,
      wins,
    };
  }, [finished, me]);

  const askDelete = async (round: Round) => {
    const ok = await confirmAction({
      title: 'Borrar partida',
      message: `¿Borrar la partida del ${formatDate(round.startedAt)}? No se puede deshacer.`,
      confirmLabel: 'Borrar',
      destructive: true,
    });
    if (ok) deleteRound(round.id);
  };

  if (!me) {
    return (
      <Screen>
        <Card>
          <Text style={type.h2}>Iniciá sesión para ver tus partidas</Text>
          <Text style={type.body}>
            El historial y el contador personal están asociados a tu cuenta de jugador.
          </Text>
          <Button label="Iniciar sesión" icon="log-in-outline" onPress={() => router.replace('/ingresar')} />
          <Button
            label="Crear mi perfil"
            variant="secondary"
            icon="person-add-outline"
            onPress={() => router.replace('/registro')}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={type.label}>Contador de {me.displayName}</Text>
        <Text style={type.title}>Historial de partidas</Text>
        <Text style={type.small}>
          Llevá el registro de tus partidas diarias, patadas totales, promedios e historial de tarjetas.
        </Text>
      </View>

      {/* Contador general */}
      <Card style={styles.counterCard}>
        <View style={styles.counterHeader}>
          <Ionicons name="stats-chart" size={20} color={colors.goldDark} />
          <Text style={type.h2}>Mi contador acumulado</Text>
        </View>
        <View style={styles.grid}>
          <CounterBox label="Partidas" value={String(personalSummary.totalRounds)} sub={`${personalSummary.totalHoles} hoyos`} />
          <CounterBox label="Patadas totales" value={String(personalSummary.totalKicks)} sub="acumuladas" />
          <CounterBox
            label="Mejor tarjeta"
            value={personalSummary.bestStrokes !== null ? String(personalSummary.bestStrokes) : '–'}
            sub={personalSummary.bestToPar !== null ? formatToPar(personalSummary.bestToPar) : undefined}
          />
          <CounterBox
            label="Promedio"
            value={
              personalSummary.avgToPar !== null
                ? `${personalSummary.avgToPar > 0 ? '+' : ''}${personalSummary.avgToPar.toFixed(1)}`
                : '–'
            }
            sub="al par"
          />
        </View>
        <View style={styles.badgesRow}>
          <View style={styles.pillStat}>
            <Text style={styles.pillNum}>{personalSummary.birdiesOrBetter}</Text>
            <Text style={styles.pillText}>Bajo par (Birdies+)</Text>
          </View>
          <View style={styles.pillStat}>
            <Text style={styles.pillNum}>{personalSummary.pars}</Text>
            <Text style={styles.pillText}>Pares</Text>
          </View>
          <View style={styles.pillStat}>
            <Text style={styles.pillNum}>{personalSummary.aces}</Text>
            <Text style={styles.pillText}>Hoyos en 1</Text>
          </View>
          {personalSummary.wins > 0 ? (
            <View style={styles.pillStat}>
              <Text style={styles.pillNum}>{personalSummary.wins}</Text>
              <Text style={styles.pillText}>Ganadas</Text>
            </View>
          ) : null}
        </View>
      </Card>

      <Segmented
        options={[
          { value: 'all', label: `Todas (${finished.length})` },
          { value: 'individual', label: 'Individual' },
          { value: 'duo', label: 'Dúo' },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {filtered.length === 0 ? (
        <Card>
          <Text style={type.h2}>Todavía no hay partidas acá</Text>
          <Text style={type.body}>
            Cada vez que termines una ronda en la cancha, va a quedar guardada acá con tu tarjeta completa, Ida/Vuelta y estadísticas.
          </Text>
          <Button label="Empezar una partida" icon="football-outline" compact onPress={() => router.push('/ronda/nueva')} />
        </Card>
      ) : (
        <View style={styles.list}>
          {filtered.map((r) => {
            const myPlayer = me ? r.players.find((p) => p.profileId === me.id) ?? r.players[0] : r.players[0];
            const myTotals = myPlayer ? playerTotals(r, myPlayer.id) : null;
            const lb = leaderboard(r);
            const myRow = myPlayer ? lb.find((x) => x.player.id === myPlayer.id) : null;

            return (
              <Card
                key={r.id}
                onPress={() => router.push({ pathname: '/ronda/[id]/resumen', params: { id: r.id } })}>
                <View style={styles.cardTop}>
                  <View style={styles.flex}>
                    <Text style={styles.dateText}>{formatDate(r.startedAt)}</Text>
                    <Text style={type.small}>
                      {r.courseName} · {r.holes.length} hoyos · {r.mode === 'duo' ? 'Dúo · ' : ''}
                      {formatInfo(r.format).name}
                    </Text>
                  </View>
                  {myTotals && myTotals.holesPlayed > 0 ? (
                    <View style={styles.myScoreBox}>
                      <Text style={styles.myScoreBig}>{myTotals.strokes}</Text>
                      <Text style={styles.myScoreSub}>{formatToPar(myTotals.toPar)}</Text>
                    </View>
                  ) : null}
                </View>

                {myTotals && r.holes.length > 9 ? (
                  <View style={styles.splitRow}>
                    <Text style={styles.splitChip}>Ida (OUT): {myTotals.frontStrokes} patadas</Text>
                    <Text style={styles.splitChip}>Vuelta (IN): {myTotals.backStrokes} patadas</Text>
                  </View>
                ) : null}

                <Text style={type.body}>{standingsText(r)}</Text>

                {myRow && r.players.length > 1 ? (
                  <Text style={styles.posBadge}>
                    Terminaste {myRow.position}º{myRow.tied ? ' (empate)' : ''} de {r.players.length} jugadores
                  </Text>
                ) : null}

                <View style={styles.cardActions}>
                  <Text style={styles.viewLink}>Ver tarjeta completa →</Text>
                  <Pressable accessibilityRole="button" onPress={() => askDelete(r)} hitSlop={8}>
                    <Text style={styles.deleteText}>Borrar</Text>
                  </Pressable>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: space.xs },
  counterCard: {
    borderColor: colors.gold,
    borderWidth: 1.5,
    backgroundColor: colors.cream,
  },
  counterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  counterBox: {
    flex: 1,
    minWidth: 90,
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  counterVal: {
    fontFamily: fonts.serif,
    fontSize: 24,
    fontWeight: '700',
    color: colors.forest,
    fontVariant: ['tabular-nums'],
  },
  counterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textAlign: 'center',
  },
  counterSub: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.goldDark,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  pillStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pillNum: {
    fontWeight: '800',
    fontSize: 13,
    color: colors.forest,
    fontVariant: ['tabular-nums'],
  },
  pillText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  list: {
    gap: space.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  dateText: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    textTransform: 'capitalize',
  },
  myScoreBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 54,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.forest,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  myScoreBig: {
    color: colors.cream,
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  myScoreSub: {
    color: colors.goldLight,
    fontSize: 11,
    fontWeight: '700',
  },
  splitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  splitChip: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.forest,
    backgroundColor: colors.cream,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
  },
  posBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.goldDark,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  viewLink: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.forest,
  },
  deleteText: {
    color: colors.bad,
    fontWeight: '600',
    fontSize: 13,
  },
});
