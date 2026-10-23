import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Scorecard } from '@/components/Scorecard';
import { Screen } from '@/components/Screen';
import { duoLeaderboard, duoTotals } from '@/domain/duo';
import { formatInfo } from '@/domain/formats';
import { matchStatus } from '@/domain/match';
import { canWriteRound } from '@/domain/round';
import { formatToPar, leaderboard, SCORE_NAME_ES, type ScoreName } from '@/domain/scoring';
import { playerStats, roundSummaryText } from '@/domain/stats';
import { shareText } from '@/lib/share';
import { useAppStore } from '@/store/useAppStore';
import { syncOnce } from '@/sync/engine';
import { colors, fonts, radius, space, type } from '@/theme';

const COUNT_ORDER: ScoreName[] = ['hole-in-one', 'albatross', 'eagle', 'birdie', 'par', 'bogey', 'double-bogey', 'worse'];

const SHARE_FEEDBACK = {
  copied: 'Resultado copiado: pegalo donde quieras.',
  failed: 'No se pudo compartir. Probá de nuevo.',
} as const;

export default function SummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const round = useAppStore((s) => s.rounds.find((r) => r.id === id));
  const me = useAppStore((s) => s.me);
  const reopenRound = useAppStore((s) => s.reopenRound);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!round) return <Redirect href="/" />;

  const isDuo = round.mode === 'duo';
  const rows = leaderboard(round);
  const match = matchStatus(round);
  const duo = isDuo ? duoTotals(round) : null;
  const duoTeams = isDuo ? duoLeaderboard(round) : [];
  const isStableford = round.format === 'stableford';
  const unconfirmed = round.players.filter((p) => p.profileId && p.accepted === false);
  const countable = round.players.filter((p) => p.profileId && p.accepted !== false);
  const guests = round.players.filter((p) => !p.profileId);
  const canWrite = canWriteRound(round, me?.id, me?.role === 'admin');

  const share = async () => {
    const result = await shareText(roundSummaryText(round));
    if (result === 'copied' || result === 'failed') setFeedback(SHARE_FEEDBACK[result]);
    else setFeedback(null);
  };

  const reopen = () => {
    reopenRound(round.id);
    void syncOnce();
    router.replace({ pathname: '/ronda/[id]', params: { id: round.id } });
  };

  return (
    <Screen
      footer={
        <>
          <Button label="Compartir resultado" icon="share-social-outline" onPress={share} />
          {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
          <View style={styles.footerRow}>
            {canWrite ? <Button label="Corregir" variant="secondary" style={styles.flex} onPress={reopen} /> : null}
            <Button label="Inicio" variant="secondary" style={styles.flex} onPress={() => router.replace('/')} />
          </View>
        </>
      }>
      <Stack.Screen options={{ title: 'Resumen' }} />

      <View style={styles.header}>
        <Text style={type.label}>{isDuo ? `Dúo · ${round.duoRule === 'sum' ? 'suma' : 'mejor pelota'}` : formatInfo(round.format).name}</Text>
        <Text style={type.title}>{round.courseName}</Text>
        <Text style={type.small}>{new Date(round.startedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
      </View>

      {match ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{match.text}</Text>
          <Text style={styles.bannerSub}>
            {match.holesPlayed} de {round.holes.length} hoyos jugados
          </Text>
        </View>
      ) : null}

      {duo && duoTeams.length === 1 ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {round.players.map((p) => p.name).join(' y ')}
          </Text>
          <Text style={styles.bannerSub}>
            Equipo: {duo.strokes} patadas ({formatToPar(duo.toPar)} al par) · {duo.holesPlayed} de {round.holes.length} hoyos
          </Text>
        </View>
      ) : null}

      {duoTeams.length > 1 ? (
        <Card>
          <Text style={type.h2}>Posiciones por Dúos</Text>
          {duoTeams.map((team, i) => (
            <View key={team.index} style={[styles.rankRow, i > 0 && styles.rankDivider]}>
              <Text style={styles.position}>
                {team.position}
                {team.tied ? '=' : ''}
              </Text>
              <View style={styles.flex}>
                <Text style={styles.rankName}>{team.name}</Text>
                <Text style={type.small}>Dúo {team.index + 1}</Text>
              </View>
              <View style={styles.rankResult}>
                <Text style={styles.rankMain}>
                  {isStableford ? `${team.totals.points} pts` : `${team.totals.strokes}`}
                </Text>
                <Text style={type.small}>
                  {isStableford ? `${team.totals.strokes} patadas` : formatToPar(team.totals.toPar)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        {rows.map((row, i) => (
          <View key={row.player.id} style={[styles.rankRow, i > 0 && styles.rankDivider]}>
            <Text style={styles.position}>
              {row.position}
              {row.tied ? '=' : ''}
            </Text>
            <View style={styles.flex}>
              <Text style={styles.rankName}>{row.player.name}</Text>
              <Text style={type.small}>{!row.player.profileId ? 'Invitado' : row.player.accepted === false ? 'Registrado · sin confirmar' : 'Registrado'}</Text>
            </View>
            <View style={styles.rankResult}>
              <Text style={styles.rankMain}>{isStableford ? `${row.totals.points} pts` : `${row.totals.strokes}`}</Text>
              <Text style={type.small}>{isStableford ? `${row.totals.strokes} patadas` : formatToPar(row.totals.toPar)}</Text>
            </View>
          </View>
        ))}
      </Card>

      {unconfirmed.length > 0 ? (
        <Text style={type.small}>{unconfirmed.map((p) => p.name).join(', ')} no confirmó la ronda: su resultado no cuenta para el ranking.</Text>
      ) : guests.length > 0 ? (
        <Text style={type.small}>
          {countable.length === 0 ? 'Esta ronda no suma al ranking porque todos jugaron como invitados.' : 'Los invitados no suman al ranking: solo los jugadores registrados.'}
        </Text>
      ) : null}
      {isDuo && guests.length > 0 ? <Text style={type.small}>Para entrar al ranking de dúos, los dos tienen que estar registrados.</Text> : null}

      <Text style={type.h2}>Tarjeta</Text>
      <Scorecard round={round} />
      <Text style={type.small}>Círculo: mejor que el par. Cuadrado: peor que el par.</Text>

      <Text style={type.h2}>Estadísticas</Text>
      {round.players.map((p) => {
        const s = playerStats(round, p.id);
        const lines = COUNT_ORDER.filter((k) => s.counts[k] > 0);
        return (
          <Card key={p.id}>
            <Text style={type.h2}>{p.name}</Text>
            {lines.length === 0 ? <Text style={type.small}>Todavía no cargó hoyos.</Text> : null}
            {lines.map((k) => (
              <View key={k} style={styles.statRow}>
                <Text style={type.body}>{SCORE_NAME_ES[k]}</Text>
                <Text style={styles.statValue}>{s.counts[k]}</Text>
              </View>
            ))}
            <View style={styles.statRow}>
              <Text style={type.body}>Penalizaciones</Text>
              <Text style={styles.statValue}>{s.penalties}</Text>
            </View>
            {s.averagePerHole > 0 ? (
              <View style={styles.statRow}>
                <Text style={type.body}>Promedio por hoyo</Text>
                <Text style={styles.statValue}>{s.averagePerHole.toFixed(1)}</Text>
              </View>
            ) : null}
            {round.holes.length === 18 ? (
              <View style={styles.statRow}>
                <Text style={type.body}>Ida / vuelta</Text>
                <Text style={styles.statValue}>
                  {s.frontStrokes} / {s.backStrokes}
                </Text>
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: space.xs },
  footerRow: { flexDirection: 'row', gap: space.sm },
  feedback: { ...type.small, textAlign: 'center' },
  banner: { padding: space.lg, borderRadius: radius.md, backgroundColor: colors.forest, gap: space.xs, borderWidth: 1.5, borderColor: colors.gold },
  bannerText: { color: colors.cream, fontFamily: fonts.serif, fontSize: 26, fontWeight: '700' },
  bannerSub: { color: colors.goldLight, fontSize: 14 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  rankDivider: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm },
  position: { width: 34, fontFamily: fonts.serif, fontSize: 26, fontWeight: '700', color: colors.goldDark, fontVariant: ['tabular-nums'] },
  rankName: { ...type.h2 },
  rankResult: { alignItems: 'flex-end' },
  rankMain: { fontSize: 24, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statValue: { ...type.body, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
