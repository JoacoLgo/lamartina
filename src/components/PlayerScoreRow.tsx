import { StyleSheet, Text, View } from 'react-native';

import { RoundButton } from '@/components/RoundButton';
import { ScoreMark } from '@/components/ScoreMark';
import { formatToPar, holeTotal, isScored, type PlayerTotals, SCORE_NAME_ES, scoreName } from '@/domain/scoring';
import type { Hole, HoleScore } from '@/domain/types';
import { colors, fonts, radius, shadow, space, type } from '@/theme';

interface Props {
  name: string;
  /** etiqueta opcional del equipo si juega en modo Dúo */
  teamLabel?: string;
  /** Posición de salida en este hoyo (1 = patea primero). */
  order: number;
  hole: Hole;
  score: HoleScore | undefined;
  /** Totales acumulados del jugador en la ronda (Ida, Vuelta y Total). */
  totals?: PlayerTotals;
  hasBackNine?: boolean;
  onKicks: (delta: 1 | -1) => void;
  onPenalty: (delta: 1 | -1) => void;
  /** Se ve el puntaje pero no se puede cambiar (por ejemplo, si todavía no aceptaste la ronda). */
  readOnly?: boolean;
}

/** Tarjeta profesional de un jugador en el hoyo actual: patadas del hoyo, penalizaciones y acumulado Ida/Vuelta. */
export function PlayerScoreRow({
  name,
  teamLabel,
  order,
  hole,
  score,
  totals,
  hasBackNine = false,
  onKicks,
  onPenalty,
  readOnly = false,
}: Props) {
  const scored = isScored(score);
  const total = scored ? holeTotal(score) : 0;

  return (
    <View style={[styles.card, scored && styles.cardScored]}>
      <View style={styles.top}>
        <View style={styles.orderBadge}>
          <Text style={styles.orderText}>{order}º</Text>
        </View>
        <View style={styles.flex}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {teamLabel ? <Text style={styles.teamBadge}>{teamLabel}</Text> : null}
          </View>
          {totals ? (
            <View style={styles.accumRow}>
              <Text style={styles.accumMain}>
                Acumulado: <Text style={styles.accumStrong}>{totals.strokes} patadas</Text> ({formatToPar(totals.toPar)})
              </Text>
              {hasBackNine ? (
                <Text style={styles.accumSplit}>
                  Ida (OUT): {totals.frontStrokes} · Vuelta (IN): {totals.backStrokes}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={type.small}>Orden de salida: {order}º</Text>
          )}
        </View>
        {scored ? (
          <View style={styles.result}>
            <ScoreMark total={total} par={hole.par} size={38} />
            <Text style={styles.resultLabel}>{SCORE_NAME_ES[scoreName(total, hole.par)]}</Text>
          </View>
        ) : (
          <View style={styles.pendingPill}>
            <Text style={styles.pendingText}>Por patear</Text>
          </View>
        )}
      </View>

      <View style={[styles.kicksBox, readOnly && styles.locked]}>
        <RoundButton symbol="−" tone="outline" accessibilityLabel={`Una patada menos para ${name}`} onPress={() => onKicks(-1)} />
        <View style={styles.kicksCenter}>
          <Text style={type.score}>{scored ? score.kicks : '–'}</Text>
          <Text style={styles.kicksCaption}>
            {scored && score.penalties > 0 ? `patadas (+${score.penalties} pen = ${total})` : 'patadas en este hoyo'}
          </Text>
        </View>
        <RoundButton symbol="+" accessibilityLabel={`Una patada más para ${name}`} onPress={() => onKicks(1)} />
      </View>

      <View style={[styles.penalty, (!scored || readOnly) && styles.penaltyOff]}>
        <Text style={styles.penaltyLabel}>Penalizaciones (+1 patada c/u)</Text>
        <RoundButton symbol="−" size={36} tone="outline" accessibilityLabel={`Quitar penalización a ${name}`} onPress={() => onPenalty(-1)} />
        <Text style={styles.penaltyCount}>{score?.penalties ?? 0}</Text>
        <RoundButton symbol="+" size={36} tone="outline" accessibilityLabel={`Agregar penalización a ${name}`} onPress={() => onPenalty(1)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    gap: space.sm + 2,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    ...shadow,
  },
  cardScored: {
    borderColor: colors.gold,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  orderBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.forest,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: {
    color: colors.goldLight,
    fontFamily: fonts.serif,
    fontWeight: '700',
    fontSize: 13,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  name: { ...type.h2, fontSize: 19 },
  teamBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.forestDeep,
    backgroundColor: colors.goldLight,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  accumRow: {
    gap: 1,
    marginTop: 1,
  },
  accumMain: {
    fontSize: 13,
    color: colors.muted,
  },
  accumStrong: {
    fontWeight: '800',
    color: colors.forest,
  },
  accumSplit: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.goldDark,
  },
  result: { alignItems: 'center', gap: 2, minWidth: 64 },
  resultLabel: { fontSize: 11, fontWeight: '700', color: colors.goldDark, textAlign: 'center' },
  pendingPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pendingText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  kicksBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.creamLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  kicksCenter: { alignItems: 'center', minWidth: 110 },
  kicksCaption: { fontSize: 12, fontWeight: '600', color: colors.muted },
  penalty: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: 2 },
  locked: { opacity: 0.5, pointerEvents: 'none' },
  penaltyOff: { opacity: 0.35, pointerEvents: 'none' },
  penaltyLabel: { ...type.small, flex: 1, fontSize: 13 },
  penaltyCount: { width: 26, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
});
