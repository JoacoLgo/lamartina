import { Ionicons } from '@expo/vector-icons';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { COURSE_FLAGS, QUICK_PLAY_STEPS } from '@/app/reglas';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { PlayerScoreRow } from '@/components/PlayerScoreRow';
import { Scorecard } from '@/components/Scorecard';
import { ScoreMark } from '@/components/ScoreMark';
import { Screen } from '@/components/Screen';
import { duoPairs } from '@/domain/duo';
import { formatInfo } from '@/domain/formats';
import { canWriteRound, isHoleComplete, isRoundComplete, pendingPlayerFor, teeOrder } from '@/domain/round';
import { standingsText } from '@/domain/stats';
import { errorMessage } from '@/lib/api';
import { confirmAction } from '@/lib/dialogs';
import { useAppStore } from '@/store/useAppStore';
import { acceptRound, confirmPlayer, continueToBackNine, declineRound, syncOnce } from '@/sync/engine';
import { colors, fonts, radius, space, type } from '@/theme';

/**
 * Pantalla compacta de juego en vivo:
 * - Cabecera ágil con Hoyo, Par, Distancia y marcador en vivo.
 * - Tarjeta clásica SIEMPRE visible (tocando cualquier columna de hoyo se navega a ese hoyo).
 * - Filas de anotación compactas por jugador (con círculos/cuadrados de Birdie, Par, Bogey)
 *   para anotar 3 o 4 jugadores sin necesidad de scrollear.
 * - Al llegar al Hoyo 9, el resumen de Ida y la decisión de terminar o hacer la Vuelta
 *   se integran directamente en el pie de página sin duplicar botones ni obligar a scrollear.
 */
export default function ScoringScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const round = useAppStore((s) => s.rounds.find((r) => r.id === id));
  const me = useAppStore((s) => s.me);
  const online = useAppStore((s) => s.online);
  const pendingOps = useAppStore((s) => s.outbox.filter((o) => o.roundId === id).length);
  const changeKicks = useAppStore((s) => s.changeKicks);
  const changePenalties = useAppStore((s) => s.changePenalties);
  const goToHole = useAppStore((s) => s.goToHole);
  const finishRound = useAppStore((s) => s.finishRound);

  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  if (!round) return <Redirect href="/" />;
  if (round.finishedAt) return <Redirect href={{ pathname: '/ronda/[id]/resumen', params: { id: round.id } }} />;

  const hole = round.holes.find((h) => h.number === round.currentHole) ?? round.holes[0];
  const order = teeOrder(round, hole.number);
  const isFirst = hole.number === round.holes[0].number;
  const isLast = hole.number === round.holes[round.holes.length - 1].number;
  const isEndOfFrontNine = hole.number === 9;
  const hasBackNine = round.holes.length > 9;
  const isBackNine = hole.number > 9;
  const stageBadge = isBackNine ? 'VUELTA (10–18)' : 'IDA (1–9)';

  const canWrite = canWriteRound(round, me?.id, me?.role === 'admin');
  const invitation = pendingPlayerFor(round, me?.id);
  const toConfirm =
    me && round.createdBy === me.id
      ? round.players.filter((p) => p.profileId && p.accepted === false && p.profileId !== me.id)
      : [];

  // Mapa de etiquetas de equipo si es modo Dúo con varias parejas
  const teamLabelByPlayer = new Map<string, string>();
  if (round.mode === 'duo') {
    const pairs = duoPairs(round.players);
    pairs.forEach(([a, b], idx) => {
      const lbl = pairs.length > 1 ? `Dúo ${idx + 1}` : 'Dúo';
      teamLabelByPlayer.set(a.id, lbl);
      teamLabelByPlayer.set(b.id, lbl);
    });
  }

  const frontNineComplete = round.holes
    .filter((h) => h.number <= 9)
    .every((h) => isHoleComplete(round, h.number));
  const roundComplete = isRoundComplete(round);

  // El cartel de etapa completada aparece recién cuando TODOS los jugadores anotaron el hoyo 9 (en Ida)
  // o cuando TODOS anotaron el hoyo 18 (en caso de hacer la Vuelta).
  const showFrontCompleteBanner = isEndOfFrontNine && !hasBackNine && frontNineComplete;
  const showBackCompleteBanner = hasBackNine && hole.number === 18 && roundComplete;

  const finish = async () => {
    if (!isRoundComplete(round)) {
      const missingHoles = round.holes.filter((h) => !isHoleComplete(round, h.number)).map((h) => h.number);
      const missingLabel = `Hoyo${missingHoles.length > 1 ? 's' : ''} sin completar: ${missingHoles.join(', ')}.`;
      const msg =
        hasBackNine && frontNineComplete
          ? `${missingLabel} Tus primeros 9 hoyos (Ida) están completos y se guardarán para el ranking y tu trayectoria. ¿Terminar ronda acá?`
          : `${missingLabel} Una ronda incompleta no cuenta para el ranking. ¿Terminarla igual?`;
      const ok = await confirmAction({
        title: hasBackNine && frontNineComplete ? 'Guardar Ida y terminar' : 'Faltan puntajes',
        message: msg,
        confirmLabel: 'Terminar igual',
        cancelLabel: missingHoles.length > 0 ? `Ir al Hoyo ${missingHoles[0]}` : 'Cancelar',
      });
      if (!ok) {
        if (missingHoles.length > 0) goToHole(round.id, missingHoles[0]);
        return;
      }
    }
    finishRound(round.id);
    void syncOnce();
    router.replace({ pathname: '/ronda/[id]/resumen', params: { id: round.id } });
  };

  const startVuelta = async () => {
    if (hasBackNine) {
      goToHole(round.id, 10);
    } else {
      await continueToBackNine(round.id);
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice(errorMessage(e));
    }
    setBusy(false);
  };

  const syncDotColor = !round.remote ? colors.goldLight : !online ? colors.bad : pendingOps > 0 ? colors.gold : '#66D17A';

  return (
    <Screen
      footer={
        <View style={styles.footerWrap}>
          {/* El cartel aparece recién cuando toda la línea del Hoyo 9 (Ida) o del Hoyo 18 (Vuelta) está completa */}
          {showFrontCompleteBanner || showBackCompleteBanner ? (
            <View style={styles.footerFrontBar}>
              <View style={styles.footerFrontTop}>
                <View style={styles.footerFrontHeader}>
                  <Ionicons name="flag" size={15} color={colors.forest} />
                  <Text style={styles.footerFrontTitle}>
                    {showBackCompleteBanner ? '¡Vuelta completada! (18 hoyos)' : '¡Ida completada! (9 hoyos)'}
                  </Text>
                </View>
                <Text style={styles.footerFrontHint}>
                  {showBackCompleteBanner
                    ? 'Todos los puntos anotados · Podés terminar la ronda'
                    : 'Cerrá en 9 o seguí la Vuelta (10–18)'}
                </Text>
              </View>
            </View>
          ) : null}

          {showFrontCompleteBanner && canWrite ? (
            <View style={styles.nav}>
              <Button
                label="← Ant."
                variant="secondary"
                size="sm"
                disabled={isFirst}
                style={styles.navBackCompact}
                onPress={() => goToHole(round.id, hole.number - 1)}
              />
              <Button
                label="Hacer Vuelta"
                icon="sync"
                variant="gold"
                size="sm"
                style={styles.navButton}
                onPress={() => void startVuelta()}
              />
              <Button
                label="Terminar"
                icon="flag"
                size="sm"
                style={styles.navButton}
                onPress={finish}
              />
            </View>
          ) : (
            <View style={styles.nav}>
              <Button
                label="Anterior"
                variant="secondary"
                size="sm"
                disabled={isFirst}
                style={styles.navButton}
                onPress={() => goToHole(round.id, hole.number - 1)}
              />
              {isLast ? (
                <Button
                  label="Terminar ronda"
                  icon="flag"
                  size="sm"
                  style={styles.navButton}
                  onPress={finish}
                  disabled={!canWrite}
                />
              ) : isEndOfFrontNine && hasBackNine ? (
                <Button
                  label="Ir a la Vuelta (10) →"
                  size="sm"
                  style={styles.navButton}
                  onPress={() => goToHole(round.id, 10)}
                />
              ) : (
                <Button
                  label={`Hoyo ${hole.number + 1} →`}
                  size="sm"
                  style={styles.navButton}
                  onPress={() => goToHole(round.id, hole.number + 1)}
                />
              )}
            </View>
          )}
        </View>
      }>
      <Stack.Screen
        options={{
          title: round.courseName,
          headerRight: () => (
            <View style={styles.headerRightRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ver reglas rápidas y banderines"
                onPress={() => setRulesOpen(true)}
                hitSlop={10}
                style={styles.headerRulesBtn}>
                <Ionicons name="book-outline" size={14} color={colors.cream} />
                <Text style={styles.headerRulesText}>Reglas</Text>
              </Pressable>
              {canWrite ? (
                <Pressable accessibilityRole="button" onPress={finish} hitSlop={10} style={styles.headerButton}>
                  <Text style={styles.headerAction}>Terminar</Text>
                </Pressable>
              ) : null}
            </View>
          ),
        }}
      />

      {invitation ? (
        <Card style={styles.invite}>
          <Text style={type.label}>Invitación</Text>
          <Text style={type.h2}>Te sumaron a esta ronda</Text>
          <Text style={type.body}>Aceptala para poder cargar tus puntajes y que cuenten para el ranking.</Text>
          <View style={styles.inviteActions}>
            <Button
              label="Aceptar y jugar"
              icon="checkmark"
              size="sm"
              compact
              disabled={busy}
              onPress={() => run(() => acceptRound(round.id))}
            />
            <Button
              label="No es mi ronda"
              variant="ghost"
              size="sm"
              compact
              disabled={busy}
              onPress={() =>
                run(async () => {
                  await declineRound(round.id);
                  router.replace('/');
                })
              }
            />
          </View>
        </Card>
      ) : null}

      {toConfirm.length > 0 ? (
        <Card style={styles.invite}>
          <Text style={type.label}>Falta confirmar</Text>
          <Text style={type.small}>
            Estas personas todavía no aceptaron la ronda: no suman al ranking hasta confirmar con su contraseña o desde su celular.
          </Text>
          {toConfirm.map((p) => (
            <View key={p.id} style={styles.confirmRow}>
              <Field
                label={p.name}
                value={passwords[p.id] ?? ''}
                onChangeText={(t) => {
                  setPasswords((prev) => ({ ...prev, [p.id]: t }));
                  setErrors((prev) => ({ ...prev, [p.id]: '' }));
                }}
                placeholder={`Contraseña de ${p.name}`}
                secureTextEntry
                error={errors[p.id]}
              />
              <Button
                label="Confirmar"
                variant="secondary"
                size="sm"
                compact
                disabled={busy || !(passwords[p.id] ?? '')}
                onPress={() =>
                  run(async () => {
                    try {
                      await confirmPlayer(round.id, p.id, passwords[p.id]);
                      setPasswords((prev) => ({ ...prev, [p.id]: '' }));
                    } catch (e) {
                      setErrors((prev) => ({ ...prev, [p.id]: errorMessage(e) }));
                    }
                  })
                }
              />
            </View>
          ))}
        </Card>
      ) : null}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {round.syncError ? <Text style={styles.notice}>{round.syncError}</Text> : null}

      {/* CABECERA BIEN DISTRIBUIDA DEL HOYO ACTUAL */}
      <View style={styles.holeBanner}>
        <View style={styles.bannerMainRow}>
          <View style={styles.holeTitleGroup}>
            <Text style={styles.holeBig}>
              Hoyo {hole.number}
              <Text style={styles.holeOf}> / {round.holes.length}</Text>
            </Text>
            <View style={styles.parInlineBadge}>
              <Text style={styles.parInlineText}>
                PAR {hole.par}
                {hole.distanceM ? ` · ${hole.distanceM} m` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.stageRow}>
            <View style={[styles.syncDot, { backgroundColor: syncDotColor }]} />
            <Text style={styles.stageText} numberOfLines={1}>
              {stageBadge} · {round.mode === 'duo' ? 'Dúo' : formatInfo(round.format).name.replace(' (medal)', '')}
            </Text>
          </View>
        </View>

        <View style={styles.bannerStatusRow}>
          <View style={styles.standingsWrap}>
            <Ionicons name="trophy-outline" size={13} color={colors.goldLight} />
            <Text style={styles.standingsLive} numberOfLines={1}>
              {standingsText(round)}
            </Text>
          </View>

          {hole.tip ? (
            <View style={styles.tipInlineWrap}>
              <Ionicons name="bulb-outline" size={12} color={colors.goldLight} />
              <Text style={styles.tipText} numberOfLines={1}>
                {hole.tip}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* TARJETA SIEMPRE VISIBLE E INTERACTIVA (TOCAR UN HOYO CAMBIA A ESE HOYO) */}
      <View style={styles.scorecardSection}>
        <Scorecard
          round={round}
          currentHole={hole.number}
          onSelectHole={(h) => goToHole(round.id, h)}
        />
      </View>

      {/* FILAS COMPACTAS DE ANOTACIÓN POR JUGADOR EN ORDEN DE SALIDA */}
      <View style={styles.playersList}>
        {order.map((p, i) => (
          <PlayerScoreRow
            key={p.id}
            name={p.name}
            teamLabel={teamLabelByPlayer.get(p.id)}
            order={i + 1}
            hole={hole}
            score={round.scores[p.id]?.[hole.number]}
            readOnly={!canWrite}
            onKicks={(d) => changeKicks(round.id, p.id, hole.number, d)}
            onPenalty={(d) => changePenalties(round.id, p.id, hole.number, d)}
          />
        ))}
      </View>

      {/* MODAL DE REGLAS RÁPIDAS Y BANDERINES EN CANCHA */}
      <Modal
        visible={rulesOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRulesOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRulesOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Ionicons name="flag" size={18} color={colors.goldLight} />
                <View>
                  <Text style={styles.modalTitle}>Reglas rápidas en cancha</Text>
                  <Text style={styles.modalSub}>Guía rápida de banderines, juego y penalizaciones</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar reglas"
                onPress={() => setRulesOpen(false)}
                hitSlop={10}
                style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={colors.cream} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator={false}>
              {/* SECCIÓN 1: BANDERINES */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionLabel}>SIGNIFICADO DE LOS BANDERINES</Text>
                <View style={styles.flagsModalGrid}>
                  {COURSE_FLAGS.map((f) => (
                    <View key={f.id} style={styles.flagModalCard}>
                      <View style={styles.flagModalHeader}>
                        <View
                          style={[
                            styles.flagSwatch,
                            { backgroundColor: f.badgeBg, borderColor: f.badgeBorder },
                          ]}>
                          <Ionicons
                            name="flag"
                            size={12}
                            color={f.id === 'white' ? '#37423B' : f.flagColor}
                          />
                        </View>
                        <View style={styles.flagModalHeadText}>
                          <Text style={styles.flagModalTitle}>{f.title}</Text>
                          <Text style={styles.flagModalMeaning}>{f.subtitle}</Text>
                        </View>
                        <View
                          style={[
                            styles.flagPenaltyBadge,
                            f.penaltyTone === 'free' ? styles.flagPenaltyFree : null,
                          ]}>
                          <Text
                            style={[
                              styles.flagPenaltyText,
                              f.penaltyTone === 'free' ? styles.flagPenaltyFreeText : null,
                            ]}>
                            {f.penaltyTag}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.flagModalRule}>{f.description}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* SECCIÓN 2: REGLAS RÁPIDAS */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionLabel}>REGLAS BÁSICAS DEL JUEGO</Text>
                {QUICK_PLAY_STEPS.map((sec) => (
                  <View key={sec.num} style={styles.quickStepCard}>
                    <View style={styles.quickStepHeader}>
                      <View style={styles.quickStepNum}>
                        <Text style={styles.quickStepNumText}>{sec.num}</Text>
                      </View>
                      <Text style={styles.quickStepTitle}>{sec.title}</Text>
                    </View>
                    <Text style={styles.quickBulletText}>{sec.text}</Text>
                  </View>
                ))}
              </View>

              {/* SECCIÓN 3: MARCAS EN TARJETA */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionLabel}>SÍMBOLOS DE LA TARJETA (EJ. PAR 4)</Text>
                <View style={styles.marksRow}>
                  <View style={styles.markChip}>
                    <ScoreMark total={2} par={4} size={24} />
                    <Text style={styles.markChipText}>Águila (-2)</Text>
                  </View>
                  <View style={styles.markChip}>
                    <ScoreMark total={3} par={4} size={24} />
                    <Text style={styles.markChipText}>Birdie (-1)</Text>
                  </View>
                  <View style={styles.markChip}>
                    <ScoreMark total={4} par={4} size={24} />
                    <Text style={styles.markChipText}>Par (E)</Text>
                  </View>
                  <View style={styles.markChip}>
                    <ScoreMark total={5} par={4} size={24} />
                    <Text style={styles.markChipText}>Bogey (+1)</Text>
                  </View>
                  <View style={styles.markChip}>
                    <ScoreMark total={6} par={4} size={24} />
                    <Text style={styles.markChipText}>Doble (+2)</Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button
                label="Entendido · Volver al partido"
                icon="checkmark-circle"
                size="sm"
                onPress={() => setRulesOpen(false)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: space.xs,
  },
  headerRulesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: colors.gold,
  },
  headerRulesText: {
    color: colors.cream,
    fontSize: 13,
    fontWeight: '700',
  },
  headerButton: { paddingHorizontal: space.sm, paddingVertical: 4 },
  headerAction: { color: colors.goldLight, fontSize: 15, fontWeight: '700' },
  invite: { borderColor: colors.gold, borderWidth: 2, padding: 12 },
  inviteActions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  confirmRow: { gap: space.xs },
  notice: { color: colors.bad, fontWeight: '600', fontSize: 13 },
  holeBanner: {
    borderRadius: radius.md,
    backgroundColor: colors.forestDeep,
    borderWidth: 1.5,
    borderColor: colors.gold,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 7,
  },
  bannerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  holeTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  holeBig: {
    fontFamily: fonts.serif,
    fontSize: 24,
    fontWeight: '700',
    color: colors.cream,
  },
  holeOf: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.goldLight,
  },
  parInlineBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.forest,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  parInlineText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.goldLight,
    letterSpacing: 0.4,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  stageText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.goldLight,
  },
  bannerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(197, 164, 99, 0.28)',
  },
  standingsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  standingsLive: {
    flex: 1,
    color: colors.cream,
    fontSize: 12.5,
    fontWeight: '700',
  },
  tipInlineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '48%',
  },
  tipText: {
    color: colors.goldLight,
    fontSize: 11.5,
  },
  scorecardSection: {
    marginVertical: 0,
  },
  playersList: {
    gap: 6,
  },
  footerWrap: {
    gap: 8,
  },
  footerFrontBar: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.cream,
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  footerFrontTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  footerFrontHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerFrontTitle: {
    fontFamily: fonts.serif,
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.forestDeep,
  },
  footerFrontHint: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBackCompact: { paddingHorizontal: 12 },
  navButton: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 20, 14, 0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '86%',
    borderRadius: radius.lg,
    backgroundColor: colors.cream,
    borderWidth: 1.5,
    borderColor: colors.gold,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.forestDeep,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.gold,
  },
  modalTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalTitle: {
    fontFamily: fonts.serif,
    fontSize: 17,
    fontWeight: '700',
    color: colors.cream,
  },
  modalSub: {
    fontSize: 11.5,
    color: colors.goldLight,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalContent: {
    padding: 14,
    gap: 14,
  },
  modalSection: {
    gap: 8,
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.forest,
  },
  flagsModalGrid: {
    gap: 8,
  },
  flagModalCard: {
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 5,
  },
  flagModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flagSwatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagModalHeadText: {
    flex: 1,
  },
  flagModalTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.ink,
  },
  flagModalMeaning: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.forest,
  },
  flagPenaltyBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    backgroundColor: '#FCE8E8',
    borderWidth: 1,
    borderColor: '#E5A3A3',
  },
  flagPenaltyFree: {
    backgroundColor: '#E6F5EC',
    borderColor: '#98D4B0',
  },
  flagPenaltyText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.bad,
  },
  flagPenaltyFreeText: {
    color: colors.good,
  },
  flagModalRule: {
    fontSize: 12,
    lineHeight: 16.5,
    color: colors.ink,
  },
  quickStepCard: {
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 6,
  },
  quickStepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickStepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.forestDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickStepNumText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.goldLight,
  },
  quickStepTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.forestDeep,
  },
  quickBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  quickBulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.gold,
    marginTop: 6,
  },
  quickBulletText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16.5,
    color: colors.ink,
  },
  marksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'space-between',
  },
  markChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  markChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.ink,
  },
  modalFooter: {
    padding: 12,
    backgroundColor: colors.cream,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
