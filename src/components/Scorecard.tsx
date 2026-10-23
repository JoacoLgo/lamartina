import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScoreMark } from '@/components/ScoreMark';
import { formatToPar, holeTotal, isScored, playerTotals } from '@/domain/scoring';
import { courseParTotal } from '@/domain/stats';
import type { Round } from '@/domain/types';
import { colors, radius } from '@/theme';

const NAME_W = 94;
const HOLE_W = 42;
const SUB_W = 54;
const TOTAL_W = 64;
const ROW_H = 46;

/**
 * Tarjeta profesional completa:
 * Muestra hoyos 1..9 con columna subtotal IDA (OUT), hoyos 10..18 con subtotal VUELTA (IN) y TOTAL general.
 */
export function Scorecard({ round }: { round: Round }) {
  const frontHoles = round.holes.filter((h) => h.number <= 9);
  const backHoles = round.holes.filter((h) => h.number > 9);
  const hasBack = backHoles.length > 0;
  const frontPar = courseParTotal(frontHoles);
  const backPar = courseParTotal(backHoles);
  const totalPar = courseParTotal(round.holes);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.wrap}>
      <View>
        {/* Encabezado de hoyos */}
        <View style={[styles.row, styles.headRow]}>
          <Text style={[styles.cellText, styles.nameCell, styles.head]}>Hoyo</Text>
          {frontHoles.map((h) => (
            <Text key={h.number} style={[styles.cellText, styles.holeCell, styles.head]}>
              {h.number}
            </Text>
          ))}
          <Text style={[styles.cellText, styles.subCell, styles.subHead]}>IDA (OUT)</Text>
          {hasBack
            ? backHoles.map((h) => (
                <Text key={h.number} style={[styles.cellText, styles.holeCell, styles.head]}>
                  {h.number}
                </Text>
              ))
            : null}
          {hasBack ? <Text style={[styles.cellText, styles.subCell, styles.subHead]}>VTA (IN)</Text> : null}
          <Text style={[styles.cellText, styles.totalCell, styles.head]}>TOTAL</Text>
        </View>

        {/* Fila de Par */}
        <View style={[styles.row, styles.parRow]}>
          <Text style={[styles.cellText, styles.nameCell, styles.muted]}>Par</Text>
          {frontHoles.map((h) => (
            <Text key={h.number} style={[styles.cellText, styles.holeCell, styles.muted]}>
              {h.par}
            </Text>
          ))}
          <Text style={[styles.cellText, styles.subCell, styles.subPar]}>{frontPar}</Text>
          {hasBack
            ? backHoles.map((h) => (
                <Text key={h.number} style={[styles.cellText, styles.holeCell, styles.muted]}>
                  {h.par}
                </Text>
              ))
            : null}
          {hasBack ? <Text style={[styles.cellText, styles.subCell, styles.subPar]}>{backPar}</Text> : null}
          <Text style={[styles.cellText, styles.totalCell, styles.subPar]}>{totalPar}</Text>
        </View>

        {/* Filas por jugador */}
        {round.players.map((p) => {
          const totals = playerTotals(round, p.id);
          return (
            <View key={p.id} style={styles.row}>
              <Text numberOfLines={1} style={[styles.cellText, styles.nameCell, styles.playerName]}>
                {p.name}
              </Text>
              {frontHoles.map((h) => {
                const s = round.scores[p.id]?.[h.number];
                return (
                  <View key={h.number} style={[styles.holeCell, styles.center]}>
                    {isScored(s) ? <ScoreMark total={holeTotal(s)} par={h.par} size={30} /> : <Text style={styles.muted}>–</Text>}
                  </View>
                );
              })}
              <View style={[styles.subCell, styles.center, styles.subBg]}>
                <Text style={styles.subValue}>{totals.frontStrokes || '–'}</Text>
              </View>
              {hasBack
                ? backHoles.map((h) => {
                    const s = round.scores[p.id]?.[h.number];
                    return (
                      <View key={h.number} style={[styles.holeCell, styles.center]}>
                        {isScored(s) ? <ScoreMark total={holeTotal(s)} par={h.par} size={30} /> : <Text style={styles.muted}>–</Text>}
                      </View>
                    );
                  })
                : null}
              {hasBack ? (
                <View style={[styles.subCell, styles.center, styles.subBg]}>
                  <Text style={styles.subValue}>{totals.backStrokes || '–'}</Text>
                </View>
              ) : null}
              <View style={[styles.totalCell, styles.center]}>
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
  wrap: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  row: { flexDirection: 'row', height: ROW_H, borderBottomWidth: 1, borderBottomColor: colors.line, alignItems: 'center' },
  headRow: { backgroundColor: colors.forestDeep },
  parRow: { backgroundColor: colors.creamLight },
  cellText: { textAlignVertical: 'center', textAlign: 'center', fontVariant: ['tabular-nums'] },
  center: { alignItems: 'center', justifyContent: 'center', height: '100%' },
  nameCell: { width: NAME_W, textAlign: 'left', paddingLeft: 10 },
  holeCell: { width: HOLE_W },
  subCell: { width: SUB_W, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line },
  totalCell: { width: TOTAL_W },
  head: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  subHead: { color: colors.goldLight, fontWeight: '800', fontSize: 10 },
  muted: { color: colors.muted, textAlign: 'center', fontSize: 13 },
  subPar: { color: colors.forest, fontWeight: '700', fontSize: 13 },
  subBg: { backgroundColor: '#F4F0E3' },
  subValue: { fontWeight: '800', fontSize: 14, color: colors.forest, fontVariant: ['tabular-nums'] },
  playerName: { fontWeight: '700', color: colors.ink, fontSize: 13 },
  totalText: { fontWeight: '800', fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'] },
  toParMini: { fontSize: 10, fontWeight: '700', color: colors.goldDark },
});
