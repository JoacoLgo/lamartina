import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { ScoreMark } from '@/components/ScoreMark';
import { Screen } from '@/components/Screen';
import { FORMATS } from '@/domain/formats';
import { colors, fonts, radius, space } from '@/theme';

export interface FlagRuleItem {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  badgeBg: string;
  badgeBorder: string;
  flagColor: string;
  penaltyTag: string;
  penaltyTone: 'penalty' | 'free' | 'info';
}

export const COURSE_FLAGS: FlagRuleItem[] = [
  {
    id: 'white',
    title: 'Banderín Blanco',
    subtitle: 'Fuera de límites (Out of Bounds)',
    description:
      'Marca el límite de la cancha o zonas prohibidas. Si la pelota cruza por completo la línea blanca, sumás +1 penalización y volvés a patear desde donde hiciste el tiro anterior.',
    badgeBg: '#F7F7F5',
    badgeBorder: '#B8BEB8',
    flagColor: '#FFFFFF',
    penaltyTag: '+1 pen. · Repetís tiro',
    penaltyTone: 'penalty',
  },
  {
    id: 'red',
    title: 'Banderín Rojo',
    subtitle: 'Obstáculo / Hazard lateral (monte, zanja, agua)',
    description:
      'Podés patearla como quedó sin multa, o sacarla sumando +1 penalización a un máximo de 2 pasos del punto por donde entró al obstáculo (sin acercarte al hoyo).',
    badgeBg: '#FDECEC',
    badgeBorder: '#D96B63',
    flagColor: '#D63B30',
    penaltyTag: 'Jugarla o +1 pen. (a 2 pasos)',
    penaltyTone: 'penalty',
  },
  {
    id: 'yellow',
    title: 'Banderín Amarillo',
    subtitle: 'Obstáculo frontal (agua / zanja)',
    description:
      'Podés jugarla como está o sumar +1 penalización y salir hacia atrás manteniendo el punto por donde cruzó la pelota en línea recta entre vos y el hoyo.',
    badgeBg: '#FFF8E1',
    badgeBorder: '#D4AC2B',
    flagColor: '#E5B822',
    penaltyTag: 'Jugarla o +1 pen. (atrás en línea)',
    penaltyTone: 'penalty',
  },
  {
    id: 'blue',
    title: 'Banderín Azul',
    subtitle: 'Terreno en reparación / Alivio',
    description:
      'Zona en cuidado o protegida. Si tu pelota cae ahí, la sacás gratis al punto más cercano fuera de la zona sin acercarte al hoyo.',
    badgeBg: '#EAF3FE',
    badgeBorder: '#5B9BD5',
    flagColor: '#2574C9',
    penaltyTag: 'Alivio gratis (0 pen.)',
    penaltyTone: 'free',
  },
];

export const QUICK_PLAY_STEPS = [
  {
    num: '1',
    title: 'Salida (Tee)',
    text: 'Pateá con pelota Nº 5 desde detrás de las marcas de salida (hasta 2 m atrás). En el Hoyo 1 eligen el orden; después sale 1º quien mejor jugó el hoyo anterior.',
  },
  {
    num: '2',
    title: 'En el campo',
    text: 'Siempre patea primero quien está más lejos del hoyo. Esperá a que la pelota frene del todo antes del siguiente tiro (no vale llevarla ni pisarla en movimiento).',
  },
  {
    num: '3',
    title: 'En el green y el hoyo',
    text: 'Si la pelota de un compañero molesta tu línea de tiro, pedile que la marque y la levante. El hoyo termina cuando la pelota cae adentro.',
  },
];

/** Guía ordenada y visual de cómo se juega al Footgolf, significado de los banderines y lectura de la tarjeta. */
export default function RulesScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.kicker}>GUÍA RÁPIDA DE CANCHA</Text>
        <Text style={styles.title}>Cómo se juega</Text>
        <Text style={styles.subtitle}>
          Todo lo que necesitás saber en tu primera visita: pasos básicos, qué significa cada banderín y cómo leer la tarjeta.
        </Text>
      </View>

      {/* 1. LO BÁSICO EN 3 PASOS */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>1 · REGLAS BÁSICAS PASO A PASO</Text>
        <Card style={styles.stepsCard}>
          {QUICK_PLAY_STEPS.map((s, idx) => (
            <View key={s.num} style={[styles.stepRow, idx > 0 && styles.stepDivider]}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{s.num}</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepText}>{s.text}</Text>
              </View>
            </View>
          ))}
        </Card>
      </View>

      {/* 2. SIGNIFICADO DE LOS BANDERINES Y ESTACAS */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>2 · BANDERINES Y MARCAS EN CANCHA</Text>
        <View style={styles.flagsStack}>
          {COURSE_FLAGS.map((flag) => (
            <Card key={flag.id} style={styles.flagCard}>
              <View style={styles.flagTopRow}>
                <View
                  style={[
                    styles.flagIconBox,
                    { backgroundColor: flag.badgeBg, borderColor: flag.badgeBorder },
                  ]}>
                  <Ionicons
                    name="flag"
                    size={18}
                    color={flag.id === 'white' ? '#37423B' : flag.flagColor}
                  />
                </View>

                <View style={styles.flagTitleCol}>
                  <View style={styles.flagTitleRow}>
                    <Text style={styles.flagTitle}>{flag.title}</Text>
                    <View
                      style={[
                        styles.penaltyBadge,
                        flag.penaltyTone === 'free' ? styles.penaltyFree : styles.penaltyWarn,
                      ]}>
                      <Text
                        style={[
                          styles.penaltyBadgeText,
                          flag.penaltyTone === 'free' ? styles.penaltyFreeText : styles.penaltyWarnText,
                        ]}>
                        {flag.penaltyTag}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.flagSubtitle}>{flag.subtitle}</Text>
                </View>
              </View>
              <Text style={styles.flagDescription}>{flag.description}</Text>
            </Card>
          ))}
        </View>
      </View>

      {/* 3. EL PAR Y CÓMO LEER LA TARJETA */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>3 · EL PAR Y LA TARJETA</Text>
        <Card style={styles.scoreLegendCard}>
          <Text style={styles.legendIntro}>
            Cada hoyo tiene un <Text style={styles.bold}>Par</Text> (3, 4 o 5 tiros ideales). En la tarjeta cada resultado se marca automáticamente:
          </Text>

          <View style={styles.marksGrid}>
            <View style={styles.markItem}>
              <ScoreMark total={2} par={4} size={28} />
              <View style={styles.flex}>
                <Text style={styles.markTitle}>Águila / Hoyo en 1</Text>
                <Text style={styles.markSub}>2 o más bajo el par</Text>
              </View>
            </View>

            <View style={styles.markItem}>
              <ScoreMark total={3} par={4} size={28} />
              <View style={styles.flex}>
                <Text style={styles.markTitle}>Birdie (-1)</Text>
                <Text style={styles.markSub}>1 tiro bajo el par</Text>
              </View>
            </View>

            <View style={styles.markItem}>
              <ScoreMark total={4} par={4} size={28} />
              <View style={styles.flex}>
                <Text style={styles.markTitle}>Par (E)</Text>
                <Text style={styles.markSub}>Tiros exactos del hoyo</Text>
              </View>
            </View>

            <View style={styles.markItem}>
              <ScoreMark total={5} par={4} size={28} />
              <View style={styles.flex}>
                <Text style={styles.markTitle}>Bogey (+1)</Text>
                <Text style={styles.markSub}>1 tiro sobre el par</Text>
              </View>
            </View>

            <View style={styles.markItem}>
              <ScoreMark total={6} par={4} size={28} />
              <View style={styles.flex}>
                <Text style={styles.markTitle}>Doble bogey (+2)</Text>
                <Text style={styles.markSub}>2 o más sobre el par</Text>
              </View>
            </View>
          </View>
        </Card>
      </View>

      {/* 4. FORMATOS DE JUEGO */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>4 · MODALIDADES DE PARTIDA</Text>
        <View style={styles.formatsStack}>
          {FORMATS.map((f) => (
            <Card key={f.id} style={styles.formatCard}>
              <View style={styles.formatHeaderRow}>
                <Ionicons name="trophy-outline" size={16} color={colors.goldDark} />
                <Text style={styles.formatTitle}>{f.name}</Text>
              </View>
              <Text style={styles.formatDesc}>{f.description}</Text>
            </Card>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  header: { gap: 4 },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.goldDark,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 26,
    fontWeight: '700',
    color: colors.forestDeep,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.muted,
  },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.goldDark,
  },
  stepsCard: {
    padding: 12,
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.forestDeep,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: {
    fontFamily: fonts.serif,
    fontSize: 13,
    fontWeight: '700',
    color: colors.goldLight,
  },
  stepBody: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    fontFamily: fonts.serif,
    fontSize: 15.5,
    fontWeight: '700',
    color: colors.ink,
  },
  stepText: {
    fontSize: 13,
    lineHeight: 18.5,
    color: colors.muted,
  },
  flagsStack: {
    gap: 8,
  },
  flagCard: {
    padding: 12,
    gap: 7,
  },
  flagTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flagIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  flagTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    flexWrap: 'wrap',
  },
  flagTitle: {
    fontFamily: fonts.serif,
    fontSize: 15.5,
    fontWeight: '700',
    color: colors.ink,
  },
  flagSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.forest,
  },
  flagDescription: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
  },
  penaltyBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  penaltyWarn: {
    backgroundColor: '#FBECEB',
    borderColor: '#E5B4AF',
  },
  penaltyWarnText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.bad,
  },
  penaltyFree: {
    backgroundColor: '#E9F5EC',
    borderColor: '#A8D8B6',
  },
  penaltyFreeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.good,
  },
  penaltyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  scoreLegendCard: {
    padding: 12,
    gap: 10,
  },
  legendIntro: {
    fontSize: 13,
    lineHeight: 18.5,
    color: colors.ink,
  },
  bold: {
    fontWeight: '800',
    color: colors.forestDeep,
  },
  marksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  markItem: {
    width: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.creamLight,
    borderWidth: 1,
    borderColor: colors.line,
  },
  markTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.ink,
  },
  markSub: {
    fontSize: 11,
    color: colors.muted,
  },
  formatsStack: {
    gap: space.sm,
  },
  formatCard: {
    padding: 12,
    gap: 4,
  },
  formatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formatTitle: {
    fontFamily: fonts.serif,
    fontSize: 15.5,
    fontWeight: '700',
    color: colors.ink,
  },
  formatDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
  },
});
