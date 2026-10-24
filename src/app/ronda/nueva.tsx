import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { FORMATS } from '@/domain/formats';
import { MAX_PLAYERS } from '@/domain/round';
import type { PlayerSlot, PlayFormat, RoundMode } from '@/domain/types';
import { avatarUrl, errorMessage } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { startRound, verifyPlayerByCredentials, type VerifiedRoundPlayer } from '@/sync/engine';
import { colors, fonts, radius, shadow, space } from '@/theme';

const SHORT_FORMAT_SUB: Record<PlayFormat, string> = {
  stroke: 'Suma total de patadas',
  stableford: 'Puntos por hoyo al par',
  'match-golf': 'Mano a mano por hoyos',
  'match-football': 'Cada hoyo ganado = 1 gol',
};

/** Un lugar de la ronda: jugador invitado (nombre libre) o jugador con sesión iniciada (cuenta confirmada). */
type Slot =
  | { kind: 'guest'; key: string; name: string }
  | {
      kind: 'registered';
      key: string;
      userId: string;
      name: string;
      avatarV: number | null;
      isMe: boolean;
      joinToken?: string;
      roundAuthToken?: string;
    };

type DuoPair = {
  id: string;
  a: Slot;
  b: Slot;
};

type LoginModalState =
  | {
      kind: 'individual';
      slotKey: string;
      playerIndex: number;
    }
  | {
      kind: 'duo';
      pairId: string;
      pairIndex: number;
      step: 1 | 2;
      firstPlayer?: VerifiedRoundPlayer;
    };

let counter = 0;
const nextKey = () => `s${++counter}`;

function makeGuestSlot(name = ''): Slot {
  return { kind: 'guest', key: nextKey(), name };
}

export default function NewRoundScreen() {
  const router = useRouter();
  const me = useAppStore((s) => s.me);

  const [mode, setMode] = useState<RoundMode>('individual');
  const [format, setFormat] = useState<PlayFormat>('stroke');

  // Estado para modo Individual (1 a 12 jugadores): todos arrancan vacíos y cada quien puede iniciar sesión solo para esta partida
  const [indSlots, setIndSlots] = useState<Slot[]>(() => [makeGuestSlot('')]);

  // Estado para modo Dúo: ambos integrantes deben iniciar sesión (o ambos juegan como invitados)
  const [duoPairs, setDuoPairs] = useState<DuoPair[]>(() => [
    { id: nextKey(), a: makeGuestSlot(''), b: makeGuestSlot('') },
  ]);

  // Estado del modal superpuesto de inicio de sesión rápido
  const [loginModal, setLoginModal] = useState<LoginModalState | null>(null);
  const [modalUsername, setModalUsername] = useState('');
  const [modalPassword, setModalPassword] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const activeSlots: Slot[] = mode === 'individual' ? indSlots : duoPairs.flatMap((d) => [d.a, d.b]);
  const isSlotFilled = (s: Slot) => s.kind === 'registered' || s.name.trim().length > 0;
  const namedCount = activeSlots.filter(isSlotFilled).length;

  const isFormatAllowed = (fId: PlayFormat): boolean => {
    const f = FORMATS.find((x) => x.id === fId);
    if (!f?.needsTwoPlayers) return true;
    if (mode === 'duo') return duoPairs.length === 2 || duoPairs.length === 1;
    return namedCount === 2;
  };

  const effectiveFormat: PlayFormat = isFormatAllowed(format) ? format : 'stroke';

  const canStart =
    mode === 'duo'
      ? duoPairs.length >= 1 && duoPairs.every((d) => isSlotFilled(d.a) && isSlotFilled(d.b))
      : namedCount >= 1;

  const updateIndSlot = (targetKey: string, updater: (s: Slot) => Slot) => {
    setIndSlots((prev) => prev.map((s) => (s.key === targetKey ? updater(s) : s)));
  };

  const updateDuoSlot = (targetKey: string, updater: (s: Slot) => Slot) => {
    setDuoPairs((prev) =>
      prev.map((d) => ({
        ...d,
        a: d.a.key === targetKey ? updater(d.a) : d.a,
        b: d.b.key === targetKey ? updater(d.b) : d.b,
      })),
    );
  };

  const openIndividualLogin = (slotKey: string, playerIndex: number) => {
    setModalUsername('');
    setModalPassword('');
    setModalError(null);
    setModalBusy(false);
    setLoginModal({ kind: 'individual', slotKey, playerIndex });
  };

  const openDuoLogin = (pairId: string, pairIndex: number) => {
    setModalUsername('');
    setModalPassword('');
    setModalError(null);
    setModalBusy(false);
    setLoginModal({ kind: 'duo', pairId, pairIndex, step: 1 });
  };

  const closeLoginModal = () => {
    if (modalBusy) return;
    setLoginModal(null);
    setModalUsername('');
    setModalPassword('');
    setModalError(null);
  };

  /** En Dúo Paso 1: si ya hay sesión activa en el celular y ese jugador no está en otro dúo, permite usarla en 1 toque. */
  const useCurrentSessionForDuoStep1 = () => {
    if (!loginModal || loginModal.kind !== 'duo' || loginModal.step !== 1 || !me) return;
    const otherUsedIds = new Set(
      duoPairs
        .filter((d) => d.id !== loginModal.pairId)
        .flatMap((d) => [d.a, d.b])
        .flatMap((s) => (s.kind === 'registered' ? [s.userId] : [])),
    );
    if (otherUsedIds.has(me.id)) {
      setModalError(`${me.displayName} ya está anotado en otro dúo.`);
      return;
    }
    setModalUsername('');
    setModalPassword('');
    setModalError(null);
    setLoginModal({
      ...loginModal,
      step: 2,
      firstPlayer: { user: me, joinToken: '' },
    });
  };

  const submitModalLogin = async () => {
    if (!loginModal) return;
    const u = modalUsername.trim();
    const p = modalPassword;
    if (!u || !p) {
      setModalError('Completá usuario y contraseña.');
      return;
    }

    setModalBusy(true);
    setModalError(null);
    try {
      const verified = await verifyPlayerByCredentials(u, p);

      if (loginModal.kind === 'individual') {
        const otherUsedIds = new Set(
          indSlots
            .filter((s) => s.key !== loginModal.slotKey)
            .flatMap((s) => (s.kind === 'registered' ? [s.userId] : [])),
        );
        if (otherUsedIds.has(verified.user.id)) {
          setModalError(`${verified.user.displayName} ya está anotado en la ronda.`);
          setModalBusy(false);
          return;
        }

        // IMPORTANTE: No llamamos a setSession, así la cuenta NO queda abierta en este celular;
        // solo se vincula a esta jugada mediante joinToken / roundAuthToken.
        const currentMeId = useAppStore.getState().me?.id;

        updateIndSlot(loginModal.slotKey, (old) => ({
          kind: 'registered',
          key: old.key,
          userId: verified.user.id,
          name: verified.user.displayName,
          avatarV: verified.user.avatarV,
          isMe: currentMeId === verified.user.id,
          joinToken: verified.joinToken,
          roundAuthToken: verified.token,
        }));

        setModalBusy(false);
        setLoginModal(null);
        return;
      }

      // Modo Dúo: primero inicia el Jugador 1 y obligatoriamente después el Jugador 2
      const otherUsedIds = new Set(
        duoPairs
          .filter((d) => d.id !== loginModal.pairId)
          .flatMap((d) => [d.a, d.b])
          .flatMap((s) => (s.kind === 'registered' ? [s.userId] : [])),
      );
      if (otherUsedIds.has(verified.user.id)) {
        setModalError(`${verified.user.displayName} ya está anotado en otro dúo.`);
        setModalBusy(false);
        return;
      }

      if (loginModal.step === 1) {
        setModalBusy(false);
        setModalUsername('');
        setModalPassword('');
        setModalError(null);
        setLoginModal({
          ...loginModal,
          step: 2,
          firstPlayer: verified,
        });
        return;
      }

      // Paso 2 del Dúo
      const first = loginModal.firstPlayer!;
      if (verified.user.id === first.user.id) {
        setModalError('El Jugador 2 debe tener una cuenta distinta a la del Jugador 1.');
        setModalBusy(false);
        return;
      }

      // IMPORTANTE: No llamamos a setSession en el teléfono; los tokens quedan solo en la partida.
      const currentMeId = useAppStore.getState().me?.id;

      setDuoPairs((prev) =>
        prev.map((d) =>
          d.id === loginModal.pairId
            ? {
                ...d,
                a: {
                  kind: 'registered',
                  key: d.a.key,
                  userId: first.user.id,
                  name: first.user.displayName,
                  avatarV: first.user.avatarV,
                  isMe: currentMeId === first.user.id,
                  joinToken: first.joinToken || undefined,
                  roundAuthToken: first.token,
                },
                b: {
                  kind: 'registered',
                  key: d.b.key,
                  userId: verified.user.id,
                  name: verified.user.displayName,
                  avatarV: verified.user.avatarV,
                  isMe: currentMeId === verified.user.id,
                  joinToken: verified.joinToken,
                  roundAuthToken: verified.token,
                },
              }
            : d,
        ),
      );

      setModalBusy(false);
      setLoginModal(null);
    } catch (e) {
      setModalError(errorMessage(e));
      setModalBusy(false);
    }
  };

  const start = async () => {
    setError(null);
    setStarting(true);
    const payload: PlayerSlot[] = activeSlots.map((s) =>
      s.kind === 'guest'
        ? { kind: 'guest', name: s.name }
        : {
            kind: 'registered',
            userId: s.userId,
            name: s.name,
            accepted: s.isMe || !!s.joinToken,
            joinToken: s.joinToken,
            roundAuthToken: s.roundAuthToken,
          },
    );
    // Toda ronda comienza con los 9 hoyos de Ida; al terminar el Hoyo 9 se elige en el momento si cerrar ahí o seguir la Vuelta
    const res = await startRound(payload, effectiveFormat, mode, 9);
    setStarting(false);
    if (res.ok) router.replace({ pathname: '/ronda/[id]', params: { id: res.roundId } });
    else setError(res.error);
  };

  const maxPairs = Math.floor(MAX_PLAYERS / 2);

  return (
    <Screen
      footer={
        <View style={styles.footerBar}>
          <View style={styles.flex}>
            <Text style={styles.footerSummaryTitle}>
              {mode === 'duo'
                ? `${duoPairs.length} ${duoPairs.length === 1 ? 'Dúo' : 'Dúos'}`
                : `${namedCount} ${namedCount === 1 ? 'Jugador' : 'Jugadores'}`}
              {' · '}
              {FORMATS.find((f) => f.id === effectiveFormat)?.name}
            </Text>
            <Text style={styles.footerSubText}>Al terminar el Hoyo 9 elegís si cerrás o hacés la Vuelta</Text>
          </View>
          <Button
            label={starting ? 'Armando…' : 'Jugar'}
            icon="play"
            size="sm"
            onPress={start}
            disabled={!canStart || starting}
          />
        </View>
      }>
      {/* Modo de juego compacto */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MODO DE JUEGO</Text>
        <Segmented
          options={[
            { value: 'individual', label: 'Individual' },
            { value: 'duo', label: 'Dúo' },
          ]}
          value={mode}
          onChange={(next) => setMode(next)}
        />
      </View>

      {/* SECCIÓN DE JUGADORES: INDIVIDUAL */}
      {mode === 'individual' ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>JUGADORES ({indSlots.length})</Text>

          {indSlots.map((slot, index) => {
            const label = `Jugador ${index + 1}`;
            return (
              <View key={slot.key} style={styles.compactGuestRow}>
                <View style={styles.orderBadge}>
                  <Text style={styles.orderBadgeText}>{index + 1}</Text>
                </View>

                {slot.kind === 'guest' ? (
                  <>
                    <View style={styles.flex}>
                      <Field
                        value={slot.name}
                        onChangeText={(t) => updateIndSlot(slot.key, (s) => ({ ...s, name: t }))}
                        placeholder={label}
                        autoCapitalize="words"
                        style={styles.compactFieldInput}
                      />
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Iniciar sesión para ${label}`}
                      onPress={() => openIndividualLogin(slot.key, index + 1)}
                      style={({ pressed }) => [styles.loginInlineBtn, pressed && { opacity: 0.85 }]}>
                      <Ionicons name="log-in-outline" size={15} color={colors.forestDeep} />
                      <Text style={styles.loginInlineText}>Iniciar sesión</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View style={styles.registeredFieldBox}>
                      <Avatar name={slot.name} id={slot.userId} uri={avatarUrl(slot.userId, slot.avatarV)} size={26} />
                      <Text style={styles.registeredFieldName} numberOfLines={1}>
                        {slot.name}
                      </Text>
                      <Ionicons name="checkmark-circle" size={16} color={colors.moss} />
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Cambiar ${slot.name} a invitado`}
                      onPress={() => updateIndSlot(slot.key, (old) => ({ kind: 'guest', key: old.key, name: '' }))}
                      style={styles.logoutInlineBtn}>
                      <Text style={styles.logoutInlineText}>Salir</Text>
                    </Pressable>
                  </>
                )}

                {indSlots.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${label}`}
                    onPress={() => setIndSlots((p) => p.filter((s) => s.key !== slot.key))}
                    style={styles.iconRemove}>
                    <Ionicons name="close-circle" size={20} color={colors.bad} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}

          {indSlots.length < MAX_PLAYERS ? (
            <View style={styles.actionsWrap}>
              <Button
                label={`+ Jugador ${indSlots.length + 1}`}
                variant="secondary"
                size="sm"
                compact
                onPress={() => setIndSlots((p) => [...p, makeGuestSlot('')])}
              />
            </View>
          ) : null}
        </View>
      ) : (
        /* SECCIÓN DE JUGADORES: DÚO */
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{duoPairs.length === 1 ? 'DÚO' : `DÚOS (${duoPairs.length})`}</Text>

          {duoPairs.map((pair, pairIdx) => {
            const isPairLogged = pair.a.kind === 'registered' && pair.b.kind === 'registered';
            return (
              <Card key={pair.id} style={[styles.duoCard, isPairLogged && styles.duoCardConfirmed]}>
                <View style={styles.duoHeaderRow}>
                  <View style={styles.duoTitleWrap}>
                    <Ionicons name="people" size={16} color={colors.forest} />
                    <Text style={styles.duoTitle}>Dúo {pairIdx + 1}</Text>
                  </View>

                  <View style={styles.duoHeaderActions}>
                    {isPairLogged ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          setDuoPairs((prev) =>
                            prev.map((d) =>
                              d.id === pair.id
                                ? {
                                    ...d,
                                    a: { kind: 'guest', key: d.a.key, name: '' },
                                    b: { kind: 'guest', key: d.b.key, name: '' },
                                  }
                                : d,
                            ),
                          )
                        }
                        style={styles.logoutInlineBtn}>
                        <Text style={styles.logoutInlineText}>Jugar como invitados</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Iniciar sesión para Dúo ${pairIdx + 1}`}
                        onPress={() => openDuoLogin(pair.id, pairIdx + 1)}
                        style={({ pressed }) => [styles.loginInlineBtn, pressed && { opacity: 0.85 }]}>
                        <Ionicons name="log-in-outline" size={15} color={colors.forestDeep} />
                        <Text style={styles.loginInlineText}>Iniciar sesión</Text>
                      </Pressable>
                    )}

                    {duoPairs.length > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Quitar Dúo ${pairIdx + 1}`}
                        onPress={() => setDuoPairs((prev) => prev.filter((p) => p.id !== pair.id))}
                        style={styles.iconRemove}>
                        <Ionicons name="close-circle" size={20} color={colors.bad} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View style={styles.duoSideBySide}>
                  {([pair.a, pair.b] as const).map((slot, memberIdx) => {
                    const memberLabel = `Jugador ${memberIdx + 1}`;
                    return (
                      <View key={slot.key} style={styles.duoHalfCol}>
                        <Text style={styles.duoColLabel}>{memberLabel}</Text>
                        {slot.kind === 'guest' ? (
                          <Field
                            value={slot.name}
                            onChangeText={(t) => updateDuoSlot(slot.key, (s) => ({ ...s, name: t }))}
                            placeholder={memberLabel}
                            autoCapitalize="words"
                            style={styles.compactFieldInput}
                          />
                        ) : (
                          <View style={styles.registeredFieldBox}>
                            <Avatar
                              name={slot.name}
                              id={slot.userId}
                              uri={avatarUrl(slot.userId, slot.avatarV)}
                              size={24}
                            />
                            <Text style={styles.registeredFieldName} numberOfLines={1}>
                              {slot.name}
                            </Text>
                            <Ionicons name="checkmark-circle" size={15} color={colors.moss} />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </Card>
            );
          })}

          {duoPairs.length < maxPairs ? (
            <Button
              label={`+ Dúo ${duoPairs.length + 1}`}
              variant="secondary"
              size="sm"
              compact
              onPress={() =>
                setDuoPairs((prev) => [...prev, { id: nextKey(), a: makeGuestSlot(''), b: makeGuestSlot('') }])
              }
            />
          ) : null}
        </View>
      )}

      {/* FORMATO DE JUEGO EN GRILLA 2x2 COMPACTA */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>FORMATO DE JUEGO</Text>
        <View style={styles.formatGrid}>
          {FORMATS.map((f) => {
            const available = isFormatAllowed(f.id);
            const selected = effectiveFormat === f.id;
            return (
              <Pressable
                key={f.id}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: !available }}
                disabled={!available}
                onPress={() => setFormat(f.id)}
                style={[
                  styles.formatCell,
                  selected && styles.formatCellSelected,
                  !available && styles.formatCellDisabled,
                ]}>
                <View style={styles.formatCellTop}>
                  <Text style={[styles.formatCellTitle, selected && styles.formatCellTitleSelected]} numberOfLines={1}>
                    {f.name}
                  </Text>
                  {selected ? <Ionicons name="checkmark-circle" size={16} color={colors.forest} /> : null}
                </View>
                <Text style={styles.formatCellSub} numberOfLines={1}>
                  {available ? SHORT_FORMAT_SUB[f.id] : 'Pide 2 rivales'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* MODAL SUPERPUESTO DE INICIO DE SESIÓN RÁPIDO (INDIVIDUAL Y DÚO) */}
      <Modal
        visible={loginModal !== null}
        transparent
        animationType="fade"
        onRequestClose={closeLoginModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeLoginModal} />

          {loginModal ? (
            <View style={styles.modalCard}>
              <View style={styles.modalTopRow}>
                <View style={styles.flex}>
                  <Text style={styles.modalKicker}>
                    {loginModal.kind === 'individual'
                      ? `REGISTRAR PARTIDA · JUGADOR ${loginModal.playerIndex}`
                      : `DÚO ${loginModal.pairIndex} · PASO ${loginModal.step} DE 2`}
                  </Text>
                  <Text style={styles.modalTitle}>
                    {loginModal.kind === 'individual'
                      ? `Iniciar sesión (Jugador ${loginModal.playerIndex})`
                      : loginModal.step === 1
                        ? 'Iniciar sesión · Jugador 1'
                        : 'Iniciar sesión · Jugador 2'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                  onPress={closeLoginModal}
                  hitSlop={8}
                  style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color={colors.muted} />
                </Pressable>
              </View>

              {loginModal.kind === 'duo' && loginModal.step === 1 ? (
                <Text style={styles.modalSub}>
                  Para anotar al dúo con cuenta, ambos jugadores deben iniciar sesión. Si salen antes, jugarán como invitados.
                </Text>
              ) : null}

              {loginModal.kind === 'duo' && loginModal.step === 2 && loginModal.firstPlayer ? (
                <View style={styles.duoStepBanner}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.moss} />
                  <View style={styles.flex}>
                    <Text style={styles.duoStepBannerTitle}>
                      Jugador 1 listo: {loginModal.firstPlayer.user.displayName}
                    </Text>
                    <Text style={styles.duoStepBannerSub}>
                      Ahora debe ingresar el Jugador 2 obligatoriamente (sino salen y juegan como invitados).
                    </Text>
                  </View>
                </View>
              ) : null}

              {loginModal.kind === 'duo' && loginModal.step === 1 && me ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={useCurrentSessionForDuoStep1}
                  style={({ pressed }) => [styles.quickMeChip, pressed && { opacity: 0.85 }]}>
                  <Avatar name={me.displayName} id={me.id} uri={avatarUrl(me.id, me.avatarV)} size={24} />
                  <Text style={styles.quickMeText} numberOfLines={1}>
                    Usar mi sesión activa ({me.displayName})
                  </Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.forestDeep} />
                </Pressable>
              ) : null}

              <View style={styles.modalFieldsRow}>
                <View style={styles.modalColHalf}>
                  <Field
                    label="Usuario"
                    value={modalUsername}
                    onChangeText={setModalUsername}
                    placeholder="tu usuario"
                    autoFocus
                    returnKeyType="next"
                    style={styles.compactFieldInput}
                  />
                </View>
                <View style={styles.modalColHalf}>
                  <Field
                    label="Contraseña"
                    value={modalPassword}
                    onChangeText={setModalPassword}
                    placeholder="tu clave"
                    secureTextEntry
                    returnKeyType="done"
                    onSubmitEditing={submitModalLogin}
                    style={styles.compactFieldInput}
                  />
                </View>
              </View>

              {modalError ? <Text style={styles.modalErrorText}>{modalError}</Text> : null}

              <View style={styles.modalActionsRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={closeLoginModal}
                  style={styles.modalCancelBtn}>
                  <Text style={styles.modalCancelText}>
                    {loginModal.kind === 'duo' ? 'Salir (invitados)' : 'Cancelar'}
                  </Text>
                </Pressable>

                <Button
                  label={
                    modalBusy
                      ? 'Verificando…'
                      : loginModal.kind === 'duo' && loginModal.step === 1
                        ? 'Siguiente (Jugador 2)'
                        : 'Entrar'
                  }
                  icon="log-in-outline"
                  size="sm"
                  onPress={submitModalLogin}
                  disabled={modalBusy}
                />
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.goldDark,
  },
  compactGuestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactFieldInput: {
    height: 42,
    minHeight: 42,
    paddingVertical: 0,
    paddingHorizontal: 11,
    fontSize: 14.5,
  },
  orderBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBadgeText: {
    color: colors.cream,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: fonts.serif,
  },
  loginInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.goldLight,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  loginInlineText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.forestDeep,
  },
  logoutInlineBtn: {
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.line,
  },
  logoutInlineText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.muted,
  },
  registeredFieldBox: {
    flex: 1,
    minWidth: 0,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.moss,
    backgroundColor: '#F2F6EE',
  },
  registeredFieldName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.forestDeep,
  },
  iconRemove: {
    padding: 2,
  },
  actionsWrap: { gap: 8 },
  error: { color: colors.bad, fontWeight: '600', fontSize: 13 },
  duoCard: {
    padding: 11,
    gap: 8,
    borderColor: colors.gold,
    borderWidth: 1.5,
  },
  duoCardConfirmed: {
    borderColor: colors.moss,
  },
  duoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  duoTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  duoTitle: {
    fontFamily: fonts.serif,
    fontSize: 16.5,
    fontWeight: '700',
    color: colors.forest,
  },
  duoHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  duoSideBySide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  duoHalfCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  duoColLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.forest,
  },
  formatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formatCell: {
    width: '48.5%',
    flexGrow: 1,
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    gap: 2,
  },
  formatCellSelected: {
    borderColor: colors.forest,
    backgroundColor: '#F4F0E3',
  },
  formatCellDisabled: {
    opacity: 0.42,
  },
  formatCellTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  formatCellTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.ink,
    flexShrink: 1,
  },
  formatCellTitleSelected: {
    color: colors.forest,
    fontWeight: '800',
  },
  formatCellSub: {
    fontSize: 11.5,
    color: colors.muted,
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  footerSummaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  footerSubText: {
    fontSize: 11.5,
    color: colors.muted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(13, 28, 18, 0.56)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 370,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.gold,
    padding: 15,
    gap: 11,
    ...shadow,
  },
  modalTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  modalKicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.goldDark,
  },
  modalTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: colors.forestDeep,
  },
  modalCloseBtn: {
    padding: 2,
  },
  modalSub: {
    fontSize: 12,
    lineHeight: 16.5,
    color: colors.muted,
  },
  duoStepBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: '#EEF5E9',
    borderWidth: 1,
    borderColor: colors.moss,
  },
  duoStepBannerTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.forestDeep,
  },
  duoStepBannerSub: {
    fontSize: 11,
    lineHeight: 14.5,
    color: colors.forest,
  },
  quickMeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  quickMeText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.forestDeep,
  },
  modalFieldsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
  },
  modalColHalf: {
    flex: 1,
    minWidth: 0,
  },
  modalErrorText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.bad,
    textAlign: 'center',
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 2,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
});
