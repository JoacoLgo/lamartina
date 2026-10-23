import { Ionicons } from '@expo/vector-icons';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { PlayerScoreRow } from '@/components/PlayerScoreRow';
import { Scorecard } from '@/components/Scorecard';
import { Screen } from '@/components/Screen';
import { duoPairs } from '@/domain/duo';
import { formatInfo } from '@/domain/formats';
import { canWriteRound, isHoleComplete, isRoundComplete, pendingPlayerFor, teeOrder } from '@/domain/round';
import { formatToPar, playerTotals } from '@/domain/scoring';
import { standingsText } from '@/domain/stats';
import { errorMessage } from '@/lib/api';
import { confirmAction } from '@/lib/dialogs';
import { useAppStore } from '@/store/useAppStore';
import { acceptRound, confirmPlayer, continueToBackNine, declineRound, syncOnce } from '@/sync/engine';
import { colors, fonts, radius, space, type } from '@/theme';

/**
 * Pantalla profesional de juego en vivo:
 * - Cabecera estilo torneo con etapa (Ida OUT / Vuelta IN), Par, Distancia, Consejo y Marcador en vivo.
 * - Al llegar al final de la Ida (Hoyo 9), muestra el resumen parcial de patadas de la Ida y permite
 *   continuar a la Vuelta (IN · Hoyos 10 a 18) o cerrar la partida.
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
  const [showCard, setShowCard] = useState(false);

  if (!round) return <Redirect href="/" />;
  if (round.finishedAt) return <Redirect href={{ pathname: '/ronda/[id]/resumen', params: { id: round.id } }} />;

  const hole = round.holes.find((h) => h.number === round.currentHole) ?? round.holes[0];
  const order = teeOrder(round, hole.number);
  const isFirst = hole.number === round.holes[0].number;
  const isLast = hole.number === round.holes[round.holes.length - 1].number;
  const isEndOfFrontNine = hole.number === 9;
  const hasBackNine = round.holes.length > 9;
  const isBackNine = hole.number > 9;
  const stageBadge = isBackNine ? 'VUELTA · IN (Hoyos 10–18)' : 'IDA · OUT (Hoyos 1–9)';

  const canWrite = canWriteRound(round, me?.id, me?.role === 'admin');
  const invitation = pendingPlayerFor(round, me?.id);
  const toConfirm =
    me && round.createdBy === me.id ? round.players.filter((p) => p.profileId && p.accepted === false && p.profileId !== me.id) : [];

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

  const finish = async () => {
    if (!isRoundComplete(round)) {
      const ok = await confirmAction({
        title: 'Faltan puntajes',
        message: 'Hay hoyos sin cargar. Una ronda incompleta no cuenta para el ranking. ¿Terminarla igual?',
        confirmLabel: 'Terminar',
      });
      if (!ok) return;
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

  const syncLabel = !round.remote
    ? 'Guardado en este dispositivo'
    : !online
      ? `Sin señal · guardado local${pendingOps ? ` (${pendingOps} pend.)` : ''}`
      : pendingOps > 0
        ? 'Sincronizando…'
        : 'En vivo · sincronizada';

  return (
    <Screen
      footer={
        <View style={styles.footerWrap}>
          {isEndOfFrontNine && !hasBackNine && canWrite ? (
            <Button
              label="Continuar Vuelta (IN · Hoyos 10–18)"
              icon="sync"
              variant="gold"
              size="sm"
              onPress={() => void startVuelta()}
            />
          ) : null}
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
              <Button label="Terminar ronda" icon="flag" size="sm" style={styles.navButton} onPress={finish} disabled={!canWrite} />
            ) : isEndOfFrontNine && hasBackNine ? (
              <Button
                label="Ir a la Vuelta (IN · 10)"
                icon="arrow-forward"
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
        </View>
      }>
      <Stack.Screen
        options={{
          title: round.courseName,
          headerRight: () =>
            canWrite ? (
              <Pressable accessibilityRole="button" onPress={finish} hitSlop={10} style={styles.headerButton}>
                <Text style={styles.headerAction}>Terminar</Text>
              </Pressable>
            ) : null,
        }}
      />

      {invitation ? (
        <Card style={styles.invite}>
          <Text style={type.label}>Invitación</Text>
          <Text style={type.h2}>Te sumaron a esta ronda</Text>
          <Text style={type.body}>Aceptala para poder cargar tus puntajes y que cuenten para el ranking.</Text>
          <View style={styles.inviteActions}>
            <Button label="Aceptar y jugar" icon="checkmark" size="sm" compact disabled={busy} onPress={() => run(() => acceptRound(round.id))} />
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

      {/* BANNER PROFESIONAL DEL HOYO ACTUAL */}
      <View style={styles.holeBanner}>
        <View style={styles.bannerTopRow}>
          <View style={styles.stageBadge}>
            <Ionicons name="flag" size={12} color={colors.forestDeep} />
            <Text style={styles.stageBadgeText}>{stageBadge}</Text>
          </View>
          <Text style={styles.formatBadge}>
            {round.mode === 'duo' ? 'Dúo · ' : ''}
            {formatInfo(round.format).name}
          </Text>
        </View>

        <View style={styles.bannerMainRow}>
          <View>
            <Text style={styles.holeBig}>
              Hoyo {hole.number} <Text style={styles.holeOf}>/ {round.holes.length}</Text>
            </Text>
            {hole.number > 9 ? (
              <Text style={styles.backNineEquivalent}>Segunda pasada del Hoyo {hole.number - 9}</Text>
            ) : null}
          </View>

          <View style={styles.parBox}>
            <Text style={styles.parBoxLabel}>PAR</Text>
            <Text style={styles.parBoxVal}>{hole.par}</Text>
            {hole.distanceM ? <Text style={styles.parBoxDist}>{hole.distanceM} m</Text> : null}
          </View>
        </View>

        {hole.tip ? (
          <View style={styles.tipBox}>
            <Ionicons name="bulb-outline" size={15} color={colors.goldLight} />
            <Text style={styles.tipText}>{hole.tip}</Text>
          </View>
        ) : null}

        <View style={styles.bannerFooterRow}>
          <Text style={styles.standingsLive} numberOfLines={2}>
            {standingsText(round)}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setShowCard((v) => !v)} style={styles.cardToggleChip}>
            <Ionicons name="grid-outline" size={14} color={colors.goldLight} />
            <Text style={styles.cardToggleText}>{showCard ? 'Ocultar tarjeta' : 'Ver tarjeta'}</Text>
          </Pressable>
        </View>
        <Text style={styles.syncText}>{syncLabel}</Text>
      </View>

      {showCard ? (
        <View style={styles.miniCardWrap}>
          <Scorecard round={round} />
        </View>
      ) : null}

      {/* SELECTOR DE HOYOS (IDA / VUELTA) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {round.holes.map((h) => {
          const current = h.number === hole.number;
          const complete = isHoleComplete(round, h.number);
          const isStartBack = h.number === 10;
          return (
            <View key={h.number} style={styles.stripItemWrap}>
              {isStartBack ? (
                <View style={styles.stripDivider}>
                  <Text style={styles.stripDividerText}>IN</Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Ir al hoyo ${h.number}`}
                onPress={() => goToHole(round.id, h.number)}
                style={[styles.pill, complete && styles.pillDone, current && styles.pillCurrent]}>
                <Text style={[styles.pillText, complete && styles.pillTextDone]}>{h.number}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {/* TARJETAS DE JUGADORES EN ORDEN DE SALIDA */}
      {order.map((p, i) => (
        <PlayerScoreRow
          key={p.id}
          name={p.name}
          teamLabel={teamLabelByPlayer.get(p.id)}
          order={i + 1}
          hole={hole}
          score={round.scores[p.id]?.[hole.number]}
          totals={playerTotals(round, p.id)}
          hasBackNine={hasBackNine}
          readOnly={!canWrite}
          onKicks={(d) => changeKicks(round.id, p.id, hole.number, d)}
          onPenalty={(d) => changePenalties(round.id, p.id, hole.number, d)}
        />
      ))}

      {/* RESUMEN DE FIN DE LA IDA (OUT / FRONT 9) AL LLEGAR AL HOYO 9 */}
      {isEndOfFrontNine ? (
        <Card style={styles.frontSummaryCard}>
          <View style={styles.frontSummaryHeader}>
            <Ionicons name="flag-outline" size={20} color={colors.forest} />
            <Text style={type.h2}>Subtotal Ida (OUT · Hoyos 1–9)</Text>
          </View>
          <Text style={type.small}>
            Patadas acumuladas en los primeros 9 hoyos. Podés continuar jugando la Vuelta (IN · Hoyos 10 a 18) o finalizar la ronda acá.
          </Text>
          {round.players.map((p) => {
            const t = playerTotals(round, p.id);
            const frontDiff = t.frontStrokes - t.frontPar;
            return (
              <View key={p.id} style={styles.frontPlayerRow}>
                <Text style={styles.frontPlayerName}>{p.name}</Text>
                <Text style={styles.frontPlayerScore}>
                  {t.frontStrokes} patadas ({t.frontPar > 0 ? formatToPar(frontDiff) : '–'})
                </Text>
              </View>
            );
          })}
          {!hasBackNine && canWrite ? (
            <Button
              label="Continuar a la Vuelta (IN · Hoyos 10–18)"
              icon="arrow-forward-circle-outline"
              size="sm"
              compact
              onPress={() => void startVuelta()}
            />
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerButton: { paddingHorizontal: space.md },
  headerAction: { color: colors.goldLight, fontSize: 16, fontWeight: '700' },
  invite: { borderColor: colors.gold, borderWidth: 2 },
  inviteActions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  confirmRow: { gap: space.xs },
  notice: { color: colors.bad, fontWeight: '600', fontSize: 14 },
  holeBanner: {
    borderRadius: radius.lg,
    backgroundColor: colors.forestDeep,
    borderWidth: 1.5,
    borderColor: colors.gold,
    padding: space.md,
    gap: space.xs + 2,
  },
  bannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.goldLight,
  },
  stageBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.forestDeep,
    letterSpacing: 0.6,
  },
  formatBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.goldLight,
  },
  bannerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  holeBig: {
    fontFamily: fonts.serif,
    fontSize: 36,
    fontWeight: '700',
    color: colors.cream,
  },
  holeOf: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.goldLight,
  },
  backNineEquivalent: {
    fontSize: 12,
    color: colors.goldLight,
    opacity: 0.9,
  },
  parBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.forest,
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  parBoxLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.goldLight,
  },
  parBoxVal: {
    fontFamily: fonts.serif,
    fontSize: 26,
    fontWeight: '700',
    color: colors.cream,
    lineHeight: 28,
  },
  parBoxDist: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.goldLight,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  tipText: {
    flex: 1,
    color: colors.cream,
    fontSize: 13,
  },
  bannerFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(160, 136, 88, 0.3)',
  },
  standingsLive: {
    flex: 1,
    color: colors.cream,
    fontSize: 13,
    fontWeight: '700',
  },
  cardToggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.forest,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  cardToggleText: {
    color: colors.goldLight,
    fontSize: 12,
    fontWeight: '700',
  },
  syncText: {
    fontSize: 11,
    color: colors.goldLight,
    opacity: 0.75,
  },
  miniCardWrap: {
    marginVertical: 2,
  },
  strip: { gap: space.xs + 2, paddingVertical: 2, alignItems: 'center' },
  stripItemWrap: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  stripDivider: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.goldLight,
  },
  stripDividerText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.forestDeep,
  },
  pill: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pillDone: { backgroundColor: colors.forest, borderColor: colors.forest },
  pillCurrent: { borderColor: colors.gold, borderWidth: 3 },
  pillText: { fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  pillTextDone: { color: colors.cream },
  frontSummaryCard: {
    borderColor: colors.gold,
    borderWidth: 2,
    backgroundColor: colors.cream,
  },
  frontSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  frontPlayerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  frontPlayerName: {
    fontWeight: '700',
    fontSize: 15,
    color: colors.ink,
  },
  frontPlayerScore: {
    fontWeight: '800',
    fontSize: 15,
    color: colors.forest,
    fontVariant: ['tabular-nums'],
  },
  footerWrap: {
    gap: space.xs + 2,
  },
  nav: { flexDirection: 'row', gap: space.sm },
  navButton: { flex: 1 },
});
