import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { formatInfo } from '@/domain/formats';
import { formatToPar, holeTotal, isScored, leaderboard, playerTotals } from '@/domain/scoring';
import { playerStats, standingsText } from '@/domain/stats';
import type { Round } from '@/domain/types';
import { api } from '@/lib/api';
import { confirmAction } from '@/lib/dialogs';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius, space, type } from '@/theme';

type Filter = 'all' | 'individual' | 'duo';

interface MeRanking {
  position: number | null;
  total: number;
}

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

function DistBar({
  label,
  count,
  total,
  barColor,
}: {
  label: string;
  count: number;
  total: number;
  barColor: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={styles.distRow}>
      <Text style={styles.distLabel}>{label}</Text>
      <View style={styles.distTrack}>
        <View style={[styles.distFill, { width: `${Math.max(pct, count > 0 ? 6 : 0)}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={styles.distValue}>
        {count} <Text style={styles.distPct}>({pct}%)</Text>
      </Text>
    </View>
  );
}

/**
 * MI TRAYECTORIA
 * Muestra la evolución del jugador desde que comenzó a registrar sus partidas,
 * estadísticas detalladas de cómo jugó (distribución de golpes, mejores hoyos)
 * y el historial completo de tarjetas.
 */
export default function HistoryScreen() {
  const router = useRouter();
  const me = useAppStore((s) => s.me);
  const token = useAppStore((s) => s.token);
  const rounds = useAppStore((s) => s.rounds);
  const upsertRemoteRound = useAppStore((s) => s.upsertRemoteRound);
  const deleteRound = useAppStore((s) => s.deleteRound);
  const [filter, setFilter] = useState<Filter>('all');
  const [rankingPos, setRankingPos] = useState<MeRanking | null>(null);

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
    api<{ ranking: MeRanking | null }>('GET', '/me', { token })
      .then((res) => setRankingPos(res.ranking))
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

  // Estadísticas acumuladas y análisis de juego desde la primera partida registrada
  const trajectory = useMemo(() => {
    let totalRounds = 0;
    let totalKicks = 0;
    let totalHoles = 0;
    let bestToPar: number | null = null;
    let bestStrokes: number | null = null;
    let sumToPar = 0;
    let completedRounds = 0;
    let aces = 0;
    let eaglesOrBetter = 0;
    let birdies = 0;
    let pars = 0;
    let bogeys = 0;
    let doubleOrWorse = 0;
    let penalties = 0;
    let wins = 0;
    let firstRoundAt: number | null = null;

    const holeAgg: Record<number, { played: number; sumToPar: number; sumStrokes: number }> = {};

    for (const r of finished) {
      const myPlayer = me
        ? r.players.find((p) => p.profileId === me.id) ?? r.players[0]
        : r.players[0];
      if (!myPlayer) continue;
      const t = playerTotals(r, myPlayer.id);
      if (t.holesPlayed === 0) continue;

      if (firstRoundAt === null || r.startedAt < firstRoundAt) {
        firstRoundAt = r.startedAt;
      }

      totalRounds += 1;
      totalKicks += t.strokes;
      totalHoles += t.holesPlayed;

      const st = playerStats(r, myPlayer.id);
      aces += st.counts['hole-in-one'];
      eaglesOrBetter += st.counts['hole-in-one'] + st.counts.albatross + st.counts.eagle;
      birdies += st.counts.birdie;
      pars += st.counts.par;
      bogeys += st.counts.bogey;
      doubleOrWorse += st.counts['double-bogey'] + st.counts.worse;
      penalties += st.penalties;

      for (const h of r.holes) {
        const sc = r.scores[myPlayer.id]?.[h.number];
        if (!isScored(sc)) continue;
        const tot = holeTotal(sc);
        const cur = holeAgg[h.number] ?? { played: 0, sumToPar: 0, sumStrokes: 0 };
        cur.played += 1;
        cur.sumToPar += tot - h.par;
        cur.sumStrokes += tot;
        holeAgg[h.number] = cur;
      }

      if (r.players.length > 1) {
        const lb = leaderboard(r);
        if (lb[0]?.player.id === myPlayer.id) wins += 1;
      }

      const fullComplete = t.holesPlayed === r.holes.length;
      const frontComplete =
        r.holes.length > 9 &&
        r.holes.filter((h) => h.number <= 9).every((h) => isScored(r.scores[myPlayer.id]?.[h.number]));

      if (fullComplete || frontComplete) {
        const effStrokes = fullComplete ? t.strokes : t.frontStrokes;
        const effToPar = fullComplete ? t.toPar : t.frontStrokes - t.frontPar;
        completedRounds += 1;
        sumToPar += effToPar;
        if (bestToPar === null || effToPar < bestToPar) {
          bestToPar = effToPar;
          bestStrokes = effStrokes;
        }
      }
    }

    let bestHole: { hole: number; avgToPar: number } | null = null;
    let hardestHole: { hole: number; avgToPar: number } | null = null;
    for (const [numStr, data] of Object.entries(holeAgg)) {
      if (data.played === 0) continue;
      const avg = data.sumToPar / data.played;
      const hole = Number(numStr);
      if (!bestHole || avg < bestHole.avgToPar) bestHole = { hole, avgToPar: avg };
      if (!hardestHole || avg > hardestHole.avgToPar) hardestHole = { hole, avgToPar: avg };
    }

    return {
      totalRounds,
      totalKicks,
      totalHoles,
      bestToPar,
      bestStrokes,
      avgToPar: completedRounds > 0 ? sumToPar / completedRounds : null,
      aces,
      eaglesOrBetter,
      birdies,
      pars,
      bogeys,
      doubleOrWorse,
      penalties,
      wins,
      firstRoundAt,
      bestHole,
      hardestHole,
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
          <Text style={type.h2}>Iniciá sesión para ver tu trayectoria</Text>
          <Text style={type.body}>
            Tu trayectoria, estadísticas de juego e historial de partidas están asociados a tu cuenta de jugador.
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
        <Text style={type.label}>Jugador · {me.displayName}</Text>
        <Text style={type.title}>Mi trayectoria</Text>
        <Text style={type.small}>
          {trajectory.firstRoundAt
            ? `Registrando partidas desde el ${formatDate(trajectory.firstRoundAt)}`
            : 'Tus números acumulados, cómo jugás cada hoyo y todas tus tarjetas.'}
        </Text>
      </View>

      {/* Resumen general de trayectoria */}
      <Card style={styles.counterCard}>
        <View style={styles.counterHeaderRow}>
          <View style={styles.counterHeader}>
            <Ionicons name="stats-chart" size={20} color={colors.goldDark} />
            <Text style={type.h2}>Resumen acumulado</Text>
          </View>
          {rankingPos?.position ? (
            <View style={styles.rankChip}>
              <Ionicons name="trophy" size={13} color={colors.forestDeep} />
              <Text style={styles.rankChipText}>
                Puesto #{rankingPos.position} de {rankingPos.total}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.grid}>
          <CounterBox label="Partidas" value={String(trajectory.totalRounds)} sub={`${trajectory.totalHoles} hoyos`} />
          <CounterBox label="Patadas totales" value={String(trajectory.totalKicks)} sub="acumuladas" />
          <CounterBox
            label="Mejor tarjeta"
            value={trajectory.bestStrokes !== null ? String(trajectory.bestStrokes) : '–'}
            sub={trajectory.bestToPar !== null ? formatToPar(trajectory.bestToPar) : undefined}
          />
          <CounterBox
            label="Promedio"
            value={
              trajectory.avgToPar !== null
                ? `${trajectory.avgToPar > 0 ? '+' : ''}${trajectory.avgToPar.toFixed(1)}`
                : '–'
            }
            sub="al par"
          />
        </View>

        <View style={styles.badgesRow}>
          <View style={styles.pillStat}>
            <Text style={styles.pillNum}>{trajectory.aces}</Text>
            <Text style={styles.pillText}>Hoyos en 1</Text>
          </View>
          <View style={styles.pillStat}>
            <Text style={styles.pillNum}>{trajectory.wins}</Text>
            <Text style={styles.pillText}>Partidas ganadas</Text>
          </View>
          {trajectory.penalties > 0 ? (
            <View style={styles.pillStat}>
              <Text style={styles.pillNum}>{trajectory.penalties}</Text>
              <Text style={styles.pillText}>Penalidades</Text>
            </View>
          ) : null}
        </View>
      </Card>

      {/* Estadísticas de cómo jugó (distribución de golpes y hoyos destacados) */}
      {trajectory.totalHoles > 0 ? (
        <Card>
          <View style={styles.counterHeader}>
            <Ionicons name="analytics-outline" size={20} color={colors.forest} />
            <Text style={type.h2}>Cómo jugaste ({trajectory.totalHoles} hoyos)</Text>
          </View>
          <View style={styles.distList}>
            {trajectory.eaglesOrBetter > 0 ? (
              <DistBar
                label="Águila / Hoyo en 1"
                count={trajectory.eaglesOrBetter}
                total={trajectory.totalHoles}
                barColor={colors.gold}
              />
            ) : null}
            <DistBar label="Birdie (-1)" count={trajectory.birdies} total={trajectory.totalHoles} barColor={colors.good} />
            <DistBar label="Par (E)" count={trajectory.pars} total={trajectory.totalHoles} barColor={colors.moss} />
            <DistBar label="Bogey (+1)" count={trajectory.bogeys} total={trajectory.totalHoles} barColor={colors.goldDark} />
            <DistBar
              label="Doble bogey o más"
              count={trajectory.doubleOrWorse}
              total={trajectory.totalHoles}
              barColor={colors.bad}
            />
          </View>

          {trajectory.bestHole && trajectory.hardestHole && trajectory.bestHole.hole !== trajectory.hardestHole.hole ? (
            <View style={styles.holeHighlightsRow}>
              <View style={styles.holeHighlightBox}>
                <Text style={styles.holeHighlightKicker}>TU MEJOR HOYO</Text>
                <Text style={styles.holeHighlightNum}>Hoyo {trajectory.bestHole.hole}</Text>
                <Text style={[styles.holeHighlightSub, { color: colors.good }]}>
                  Prom. {trajectory.bestHole.avgToPar > 0 ? '+' : ''}
                  {trajectory.bestHole.avgToPar.toFixed(1)} al par
                </Text>
              </View>
              <View style={styles.holeHighlightBox}>
                <Text style={styles.holeHighlightKicker}>EL MÁS EXIGENTE</Text>
                <Text style={styles.holeHighlightNum}>Hoyo {trajectory.hardestHole.hole}</Text>
                <Text style={[styles.holeHighlightSub, { color: colors.bad }]}>
                  Prom. {trajectory.hardestHole.avgToPar > 0 ? '+' : ''}
                  {trajectory.hardestHole.avgToPar.toFixed(1)} al par
                </Text>
              </View>
            </View>
          ) : null}
        </Card>
      ) : null}

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
  counterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  counterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.goldLight,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  rankChipText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.forestDeep,
  },
  distList: {
    gap: 8,
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  distLabel: {
    width: 118,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.ink,
  },
  distTrack: {
    flex: 1,
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.cream,
    overflow: 'hidden',
  },
  distFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  distValue: {
    width: 68,
    textAlign: 'right',
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  distPct: {
    fontWeight: '600',
    color: colors.muted,
    fontSize: 11.5,
  },
  holeHighlightsRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  holeHighlightBox: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.creamLight,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 2,
  },
  holeHighlightKicker: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.goldDark,
  },
  holeHighlightNum: {
    fontFamily: fonts.serif,
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  holeHighlightSub: {
    fontSize: 12,
    fontWeight: '700',
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
