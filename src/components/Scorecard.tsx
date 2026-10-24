import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScoreMark } from '@/components/ScoreMark';
import { formatToPar, holeTotal, isScored, leaderboard, playerTotals } from '@/domain/scoring';
import { courseParTotal } from '@/domain/stats';
import type { Round } from '@/domain/types';
import { colors, radius } from '@/theme';

const NAME_W = 80;
const NAME_RANKED_W = 104;
const HOLE_W = 34;
const SUB_W = 44;
const TOTAL_W = 52;
const HEAD_H = 26;
const PAR_H = 22;
const ROW_H = 34;

const TROPHY_COLORS: Record<number, string> = {
  1: '#D4AF37', // Copa de oro
  2: '#8E9AA8', // Copa de plata
  3: '#B87333', // Copa de bronce
};

interface Props {
  round: Round;
  /** Hoyo activo (se resalta la columna en la tarjeta y se centra automáticamente). */
  currentHole?: number;
  /** Si se pasa, tocar cualquier columna de hoyo cambia directamente a ese hoyo. */
  onSelectHole?: (holeNumber: number) => void;
  /** Muestra la posición (1, 2, 3 con su copa de oro/plata/bronce y siguientes) al lado de cada nombre. */
  showPositions?: boolean;
}

/**
 * Tarjeta clásica siempre visible y compacta:
 * Muestra hoyos 1..9 con subtotal IDA (OUT), hoyos 10..18 con subtotal VUELTA (IN) y TOTAL general,
 * conservando los círculos (birdie/águila) y cuadrados (bogey/doble bogey) en cada celda.
 */
export function Scorecard({ round, currentHole, onSelectHole, showPositions }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const frontHoles = round.holes.filter((h) => h.number <= 9);
  const backHoles = round.holes.filter((h) => h.number > 9);
  const hasBack = backHoles.length > 0;
  const frontPar = courseParTotal(frontHoles);
  const backPar = courseParTotal(backHoles);
  const totalPar = courseParTotal(round.holes);

  const displayPositions = showPositions ?? Boolean(round.finishedAt && !currentHole);
  const nameColStyle = displayPositions ? styles.nameCellRanked : styles.nameCell;

  const rankedRows = displayPositions
    ? leaderboard(round).map((r, idx) => ({
        player: r.player,
        totals: r.totals,
        position: idx + 1,
      }))
    : round.players.map((p, idx) => ({
        player: p,
        totals: playerTotals(round, p.id),
        position: idx + 1,
      }));

  useEffect(() => {
    if (!currentHole || !scrollRef.current) return;
    const holeIdx = currentHole <= 9 ? currentHole - 1 : currentHole - 1;
    const extraSub = currentHole > 9 ? SUB_W : 0;
    const x = Math.max(0, holeIdx * HOLE_W + extraSub - HOLE_W * 2.5);
    scrollRef.current.scrollTo({ x, animated: true });
  }, [currentHole]);

  const renderHoleHeader = (holeNum: number) => {
    const active = currentHole === holeNum;
    const content = (
      <View style={[styles.holeCell, styles.center, active && styles.activeHeadCell]}>
        <Text style={[styles.cellText, styles.head, active && styles.activeHeadText]}>{holeNum}</Text>
      </View>
    );
    if (!onSelectHole) return <View key={holeNum}>{content}</View>;
    return (
      <Pressable
        key={holeNum}
        accessibilityRole="button"
        accessibilityLabel={`Ir al hoyo ${holeNum}`}
        onPress={() => onSelectHole(holeNum)}>
        {content}
      </Pressable>
    );
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.wrap}>
      <View>
        {/* Encabezado de hoyos */}
        <View style={[styles.row, styles.headRow]}>
          <Text style={[styles.cellText, nameColStyle, styles.head]}>Hoyo</Text>
          {frontHoles.map((h) => renderHoleHeader(h.number))}
          <Text style={[styles.cellText, styles.subCell, styles.subHead]}>IDA</Text>
          {hasBack ? backHoles.map((h) => renderHoleHeader(h.number)) : null}
          {hasBack ? <Text style={[styles.cellText, styles.subCell, styles.subHead]}>VTA</Text> : null}
          <Text style={[styles.cellText, styles.totalCell, styles.head]}>TOT</Text>
        </View>

        {/* Fila de Par */}
        <View style={[styles.row, styles.parRow]}>
          <Text style={[styles.cellText, nameColStyle, styles.muted]}>Par</Text>
          {frontHoles.map((h) => {
            const active = currentHole === h.number;
            return (
              <Pressable
                key={h.number}
                disabled={!onSelectHole}
                onPress={() => onSelectHole?.(h.number)}
                style={[styles.holeCell, styles.center, active && styles.activeColPar]}>
                <Text style={[styles.cellText, styles.muted, active && styles.activeParText]}>{h.par}</Text>
              </Pressable>
            );
          })}
          <Text style={[styles.cellText, styles.subCell, styles.subPar]}>{frontPar}</Text>
          {hasBack
            ? backHoles.map((h) => {
                const active = currentHole === h.number;
                return (
                  <Pressable
                    key={h.number}
                    disabled={!onSelectHole}
                    onPress={() => onSelectHole?.(h.number)}
                    style={[styles.holeCell, styles.center, active && styles.activeColPar]}>
                    <Text style={[styles.cellText, styles.muted, active && styles.activeParText]}>{h.par}</Text>
                  </Pressable>
                );
              })
            : null}
          {hasBack ? <Text style={[styles.cellText, styles.subCell, styles.subPar]}>{backPar}</Text> : null}
          <Text style={[styles.cellText, styles.totalCell, styles.subPar]}>{totalPar}</Text>
        </View>

        {/* Filas por jugador */}
        {rankedRows.map(({ player: p, totals, position }) => {
          const trophyColor = TROPHY_COLORS[position];
          return (
            <View key={p.id} style={[styles.row, styles.playerRow]}>
              {displayPositions ? (
                <View style={[nameColStyle, styles.rankedNameWrap]}>
                  <View style={styles.rankBadgeInline}>
                    <Text
                      style={[
                        styles.rankNumberText,
                        trophyColor ? { color: trophyColor === '#D4AF37' ? '#9C7416' : trophyColor } : null,
                      ]}>
                      {position}
                    </Text>
                    {trophyColor ? <Ionicons name="trophy" size={11} color={trophyColor} /> : null}
                  </View>
                  <Text numberOfLines={1} style={styles.playerNameRanked}>
                    {p.name}
                  </Text>
                </View>
              ) : (
                <Text numberOfLines={1} style={[styles.cellText, nameColStyle, styles.playerName]}>
                  {p.name}
                </Text>
              )}
              {frontHoles.map((h) => {
                const s = round.scores[p.id]?.[h.number];
                const active = currentHole === h.number;
                return (
                  <Pressable
                    key={h.number}
                    disabled={!onSelectHole}
                    onPress={() => onSelectHole?.(h.number)}
                    style={[styles.holeCell, styles.center, active && styles.activeColCell]}>
                    {isScored(s) ? (
                      <ScoreMark total={holeTotal(s)} par={h.par} size={25} />
                    ) : (
                      <Text style={styles.muted}>–</Text>
                    )}
                  </Pressable>
                );
              })}
              <View style={[styles.subCell, styles.center, styles.subBg]}>
                <Text style={styles.subValue}>{totals.frontStrokes || '–'}</Text>
              </View>
              {hasBack
                ? backHoles.map((h) => {
                    const s = round.scores[p.id]?.[h.number];
                    const active = currentHole === h.number;
                    return (
                      <Pressable
                        key={h.number}
                        disabled={!onSelectHole}
                        onPress={() => onSelectHole?.(h.number)}
                        style={[styles.holeCell, styles.center, active && styles.activeColCell]}>
                        {isScored(s) ? (
                          <ScoreMark total={holeTotal(s)} par={h.par} size={25} />
                        ) : (
                          <Text style={styles.muted}>–</Text>
                        )}
                      </Pressable>
                    );
                  })
                : null}
              {hasBack ? (
                <View style={[styles.subCell, styles.center, styles.subBg]}>
                  <Text style={styles.subValue}>{totals.backStrokes || '–'}</Text>
                </View>
              ) : null}
              <View style={[styles.totalCell, styles.center, styles.totalCol]}>
                <Text style={styles.totalText}>{totals.strokes || '–'}</Text>
                {totals.holesPlayed > 0 ? <Text style={styles.toParMini}>{formatToPar(totals.toPar)}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    alignItems: 'center',
  },
  headRow: {
    height: HEAD_H,
    backgroundColor: colors.forestDeep,
  },
  parRow: {
    height: PAR_H,
    backgroundColor: colors.creamLight,
  },
  playerRow: {
    height: ROW_H,
  },
  cellText: {
    textAlignVertical: 'center',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  nameCell: {
    width: NAME_W,
    textAlign: 'left',
    paddingLeft: 8,
    paddingRight: 4,
  },
  nameCellRanked: {
    width: NAME_RANKED_W,
    textAlign: 'left',
    paddingLeft: 6,
    paddingRight: 4,
  },
  rankedNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: '100%',
  },
  rankBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 23,
  },
  rankNumberText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  playerNameRanked: {
    flex: 1,
    fontWeight: '700',
    color: colors.ink,
    fontSize: 11.5,
  },
  holeCell: {
    width: HOLE_W,
  },
  activeHeadCell: {
    backgroundColor: colors.gold,
  },
  activeHeadText: {
    color: colors.forestDeep,
    fontWeight: '900',
  },
  activeColPar: {
    backgroundColor: '#F3E8C8',
  },
  activeParText: {
    color: colors.forestDeep,
    fontWeight: '800',
  },
  activeColCell: {
    backgroundColor: '#FCF8EC',
  },
  subCell: {
    width: SUB_W,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.line,
  },
  totalCell: {
    width: TOTAL_W,
  },
  totalCol: {
    flexDirection: 'row',
    gap: 2,
  },
  head: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
  },
  subHead: {
    color: colors.goldLight,
    fontWeight: '800',
    fontSize: 9.5,
  },
  muted: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 11.5,
  },
  subPar: {
    color: colors.forest,
    fontWeight: '700',
    fontSize: 11.5,
  },
  subBg: {
    backgroundColor: '#F4F0E3',
  },
  subValue: {
    fontWeight: '800',
    fontSize: 12.5,
    color: colors.forest,
    fontVariant: ['tabular-nums'],
  },
  playerName: {
    fontWeight: '700',
    color: colors.ink,
    fontSize: 12,
  },
  totalText: {
    fontWeight: '800',
    fontSize: 13,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  toParMini: {
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.goldDark,
  },
});
