import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RoundButton } from '@/components/RoundButton';
import { ScoreMark } from '@/components/ScoreMark';
import { holeTotal, isScored, SCORE_NAME_ES, scoreName } from '@/domain/scoring';
import type { Hole, HoleScore } from '@/domain/types';
import { colors, fonts, radius } from '@/theme';

interface Props {
  name: string;
  /** Etiqueta opcional del equipo si juega en modo Dúo */
  teamLabel?: string;
  /** Posición de salida en este hoyo (1 = patea primero). */
  order: number;
  hole: Hole;
  score: HoleScore | undefined;
  onKicks: (delta: 1 | -1) => void;
  onPenalty: (delta: 1 | -1) => void;
  /** Se ve el puntaje pero no se puede cambiar (por ejemplo, si todavía no aceptaste la ronda). */
  readOnly?: boolean;
}

/**
 * Fila compacta de anotación por jugador:
 * El acumulado de puntos se ve arriba en la Tarjeta; acá abajo solo se registran
 * los tiros del hoyo actual, el resultado respecto al par (Birdie, Par, Bogey...) y penalizaciones.
 */
export function PlayerScoreRow({
  name,
  teamLabel,
  order,
  hole,
  score,
  onKicks,
  onPenalty,
  readOnly = false,
}: Props) {
  const scored = isScored(score);
  const total = scored ? holeTotal(score) : 0;
  const diff = total - hole.par;
  const resultText = scored ? SCORE_NAME_ES[scoreName(total, hole.par)] : null;
  const resultColor = diff < 0 ? colors.good : diff > 0 ? colors.bad : colors.forest;
  const resultBg = diff < 0 ? '#E9F5EC' : diff > 0 ? '#FBECEB' : '#EEF2EC';

  return (
    <View style={[styles.card, scored && styles.cardScored]}>
      {/* Izquierda: Orden de salida + Nombre + Estado del hoyo actual (tiros, Birdie/Par/Bogey y penalizaciones) */}
      <View style={styles.leftCol}>
        <View style={styles.orderBadge}>
          <Text style={styles.orderText}>{order}º</Text>
        </View>

        <View style={styles.infoCol}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {teamLabel ? <Text style={styles.teamBadge}>{teamLabel}</Text> : null}
            {resultText ? (
              <View style={[styles.resultPill, { backgroundColor: resultBg, borderColor: resultColor }]}>
                <Text style={[styles.resultPillText, { color: resultColor }]}>{resultText}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.subRow}>
            {scored ? (
              <Text style={styles.holeDetailText} numberOfLines={1}>
                {score.kicks} {score.kicks === 1 ? 'tiro' : 'tiros'}
                {score.penalties > 0 ? ` + ${score.penalties} pen.` : ''}
              </Text>
            ) : (
              <Text style={styles.holeDetailText}>Salida {order}º · Sin anotar</Text>
            )}

            {scored && !readOnly ? (
              score.penalties > 0 ? (
                <View style={styles.penActiveWrap}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar penalización a ${name}`}
                    onPress={() => onPenalty(-1)}
                    hitSlop={6}
                    style={styles.penMiniBtn}>
                    <Text style={styles.penMiniBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.penActiveText}>+{score.penalties} pen</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Agregar penalización a ${name}`}
                    onPress={() => onPenalty(1)}
                    hitSlop={6}
                    style={styles.penMiniBtn}>
                    <Text style={styles.penMiniBtnText}>+</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Agregar penalización a ${name}`}
                  onPress={() => onPenalty(1)}
                  hitSlop={6}
                  style={styles.penTrigger}>
                  <Text style={styles.penTriggerText}>+Pen</Text>
                </Pressable>
              )
            ) : null}
          </View>
        </View>
      </View>

      {/* Derecha: Controles de patadas (− / ScoreMark con círculo o cuadrado / +) */}
      <View style={[styles.controlsCol, readOnly && styles.locked]}>
        <RoundButton
          symbol="−"
          size={38}
          tone="outline"
          accessibilityLabel={`Una patada menos para ${name}`}
          onPress={() => onKicks(-1)}
        />

        <View style={styles.scoreCenter}>
          {scored ? (
            <ScoreMark total={total} par={hole.par} size={38} />
          ) : (
            <View style={styles.emptyScoreBox}>
              <Text style={styles.emptyScoreDash}>–</Text>
            </View>
          )}
        </View>

        <RoundButton
          symbol="+"
          size={38}
          accessibilityLabel={`Una patada más para ${name}`}
          onPress={() => onKicks(1)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  cardScored: {
    borderColor: colors.gold,
  },
  leftCol: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
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
    fontSize: 11.5,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'nowrap',
  },
  name: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    flexShrink: 1,
  },
  teamBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.forestDeep,
    backgroundColor: colors.goldLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  resultPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  resultPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  holeDetailText: {
    fontSize: 11.5,
    color: colors.muted,
    fontWeight: '600',
  },
  penTrigger: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.line,
  },
  penTriggerText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
  },
  penActiveWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: '#FBECEB',
    borderWidth: 1,
    borderColor: colors.bad,
  },
  penActiveText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.bad,
    fontVariant: ['tabular-nums'],
  },
  penMiniBtn: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  penMiniBtnText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '800',
    color: colors.bad,
  },
  controlsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreCenter: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyScoreBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.line,
    backgroundColor: colors.creamLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyScoreDash: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.muted,
  },
  locked: {
    opacity: 0.5,
    pointerEvents: 'none',
  },
});
