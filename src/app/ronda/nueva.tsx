import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { OptionRow } from '@/components/OptionRow';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { FORMATS } from '@/domain/formats';
import { MAX_PLAYERS } from '@/domain/round';
import { courseParTotal } from '@/domain/stats';
import type { PlayerSlot, PlayFormat, RoundMode } from '@/domain/types';
import { api, avatarUrl, errorMessage } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { startRound, verifyPlayer } from '@/sync/engine';
import { colors, fonts, radius, space, type } from '@/theme';

/** Un lugar de la ronda: jugador libre (nombre) o jugador registrado (con su estado de confirmación). */
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
      pw: string;
      error?: string;
      busy?: boolean;
    };

type DuoPair = {
  id: string;
  a: Slot;
  b: Slot;
};

interface Found {
  id: string;
  username: string;
  displayName: string;
  avatarV: number | null;
}

let counter = 0;
const nextKey = () => `s${++counter}`;

function makeGuestSlot(name = ''): Slot {
  return { kind: 'guest', key: nextKey(), name };
}

export default function NewRoundScreen() {
  const router = useRouter();
  const me = useAppStore((s) => s.me);
  const config = useAppStore((s) => s.config);
  const token = useAppStore((s) => s.token);

  const makeMeOrGuest = (): Slot =>
    me
      ? { kind: 'registered', key: nextKey(), userId: me.id, name: me.displayName, avatarV: me.avatarV, isMe: true, pw: '' }
      : makeGuestSlot('');

  const [mode, setMode] = useState<RoundMode>('individual');
  const [holesCount, setHolesCount] = useState<'9' | '18'>('9');
  const [format, setFormat] = useState<PlayFormat>('stroke');

  // Estado para modo Individual (1 a 12 jugadores, ideal para familias y grupos)
  const [indSlots, setIndSlots] = useState<Slot[]>(() => [makeMeOrGuest()]);

  // Estado para modo Dúo: lista de parejas (cada Dúo tiene 2 campos uno al lado del otro: Jugador 1 y Jugador 2)
  const [duoPairs, setDuoPairs] = useState<DuoPair[]>(() => [
    { id: nextKey(), a: makeMeOrGuest(), b: makeGuestSlot('') },
  ]);

  // Buscador de jugador registrado (puede apuntar a un slot específico o agregar uno nuevo en individual)
  const [searchTargetKey, setSearchTargetKey] = useState<string | 'add-ind' | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!token || query.trim().length < 2) {
      setFound([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api<{ users: Found[] }>('GET', `/users/search?q=${encodeURIComponent(query.trim())}`, { token });
        setFound(res.users);
      } catch {
        setFound([]);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query, token]);

  const activeSlots: Slot[] = mode === 'individual' ? indSlots : duoPairs.flatMap((d) => [d.a, d.b]);
  const usedIds = new Set(activeSlots.flatMap((s) => (s.kind === 'registered' ? [s.userId] : [])));
  const results = found.filter((f) => !usedIds.has(f.id));

  const isSlotFilled = (s: Slot) => s.kind === 'registered' || s.name.trim().length > 0;
  const namedCount = activeSlots.filter(isSlotFilled).length;

  // En Individual: match play pide 2 jugadores. En Dúo: match play funciona con 2 dúos (4 jugadores) o 1 dúo (2 jugadores).
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

  const updateSlot = (targetKey: string, updater: (s: Slot) => Slot) => {
    if (mode === 'individual') {
      setIndSlots((prev) => prev.map((s) => (s.key === targetKey ? updater(s) : s)));
    } else {
      setDuoPairs((prev) =>
        prev.map((d) => ({
          ...d,
          a: d.a.key === targetKey ? updater(d.a) : d.a,
          b: d.b.key === targetKey ? updater(d.b) : d.b,
        })),
      );
    }
  };

  const confirmWithPassword = async (slot: Extract<Slot, { kind: 'registered' }>) => {
    updateSlot(slot.key, (s) => ({ ...s, busy: true, error: undefined } as Slot));
    try {
      const joinToken = await verifyPlayer(slot.userId, slot.pw);
      updateSlot(slot.key, (s) => ({ ...s, joinToken, busy: false, pw: '' } as Slot));
    } catch (e) {
      updateSlot(slot.key, (s) => ({ ...s, busy: false, error: errorMessage(e) } as Slot));
    }
  };

  const selectRegisteredUser = (u: Found) => {
    const newReg: Slot = {
      kind: 'registered',
      key: nextKey(),
      userId: u.id,
      name: u.displayName,
      avatarV: u.avatarV,
      isMe: me?.id === u.id,
      pw: '',
    };
    if (searchTargetKey === 'add-ind') {
      const emptyIdx = indSlots.findIndex((s) => s.kind === 'guest' && s.name.trim() === '');
      if (emptyIdx >= 0) {
        setIndSlots((prev) => prev.map((s, i) => (i === emptyIdx ? { ...newReg, key: s.key } : s)));
      } else if (indSlots.length < MAX_PLAYERS) {
        setIndSlots((prev) => [...prev, newReg]);
      }
    } else if (searchTargetKey) {
      updateSlot(searchTargetKey, (old) => ({ ...newReg, key: old.key }));
    }
    setSearchTargetKey(null);
    setQuery('');
    setFound([]);
  };

  const start = async () => {
    setError(null);
    setStarting(true);
    const payload: PlayerSlot[] = activeSlots.map((s) =>
      s.kind === 'guest'
        ? { kind: 'guest', name: s.name }
        : { kind: 'registered', userId: s.userId, name: s.name, accepted: s.isMe || !!s.joinToken, joinToken: s.joinToken },
    );
    const res = await startRound(payload, effectiveFormat, mode, holesCount === '18' ? 18 : 9);
    setStarting(false);
    if (res.ok) router.replace({ pathname: '/ronda/[id]', params: { id: res.roundId } });
    else setError(res.error);
  };

  const basePar = courseParTotal(config.course.holes);
  const maxPairs = Math.floor(MAX_PLAYERS / 2);

  return (
    <Screen
      footer={
        <View style={styles.footerBar}>
          <View style={styles.flex}>
            <Text style={styles.footerSummaryTitle}>
              {mode === 'duo' ? `${duoPairs.length} ${duoPairs.length === 1 ? 'Dúo' : 'Dúos'}` : `${namedCount} ${namedCount === 1 ? 'Jugador' : 'Jugadores'}`}
              {' · '}
              {holesCount === '18' ? '18 hoyos (Ida y Vuelta)' : `${config.course.holes.length} hoyos (Ida)`}
            </Text>
            <Text style={type.small}>{FORMATS.find((f) => f.id === effectiveFormat)?.name}</Text>
          </View>
          <Button
            label={starting ? 'Armando…' : 'Empezar ronda'}
            icon="play"
            size="sm"
            onPress={start}
            disabled={!canStart || starting}
          />
        </View>
      }>
      {/* Cabecera de cancha y recorrido (Ida vs Ida y Vuelta) */}
      <Card style={styles.courseCard}>
        <View style={styles.courseHeader}>
          <View style={styles.flex}>
            <Text style={type.label}>La cancha</Text>
            <Text style={type.h2}>{config.course.name}</Text>
            <Text style={type.small}>
              {holesCount === '18'
                ? `18 hoyos (Ida 1–9 + Vuelta 10–18) · Par ${basePar * 2}`
                : `${config.course.holes.length} hoyos (Ida) · Par ${basePar}`}
            </Text>
          </View>
        </View>
        {config.course.holes.length === 9 ? (
          <View style={styles.fieldCompact}>
            <Text style={styles.subLabel}>Recorrido</Text>
            <Segmented
              options={[
                { value: '9', label: 'Ida · 9 hoyos (OUT)' },
                { value: '18', label: 'Ida y Vuelta · 18 hoyos' },
              ]}
              value={holesCount}
              onChange={setHolesCount}
            />
          </View>
        ) : null}
      </Card>

      {/* Modo de juego: Individual vs Dúo */}
      <View style={styles.field}>
        <Text style={type.h2}>¿Cómo juegan?</Text>
        <Segmented
          options={[
            { value: 'individual', label: 'Individual / Grupo' },
            { value: 'duo', label: 'Dúo (Parejas)' },
          ]}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setSearchTargetKey(null);
          }}
        />
        <Text style={type.small}>
          {mode === 'duo'
            ? `En parejas de 2 jugadores (${config.duoRule === 'sum' ? 'se suman las patadas de los dos' : 'mejor pelota de los dos en cada hoyo'}). Podés anotar 1 dúo o sumar más dúos para competir.`
            : `Cada jugador anota su tarjeta. Podés sumar familiares o amigos (hasta ${MAX_PLAYERS} jugadores en la misma partida).`}
        </Text>
      </View>

      {/* SECCIÓN DE JUGADORES: INDIVIDUAL */}
      {mode === 'individual' ? (
        <View style={styles.field}>
          <View style={styles.sectionHeaderRow}>
            <Text style={type.h2}>Jugadores ({indSlots.length})</Text>
            <Text style={type.small}>Orden de salida en el Hoyo 1</Text>
          </View>

          {indSlots.map((slot, index) => {
            const label = `Jugador ${index + 1}`;
            return slot.kind === 'guest' ? (
              <Card key={slot.key} style={styles.playerSlotCard}>
                <View style={styles.slotTopRow}>
                  <View style={styles.orderBadge}>
                    <Text style={styles.orderBadgeText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.slotTitle}>{label}</Text>
                  <View style={styles.flex} />
                  {token ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setSearchTargetKey(searchTargetKey === slot.key ? null : slot.key);
                        setQuery('');
                      }}
                      style={styles.inlineActionChip}>
                      <Ionicons name="search-outline" size={14} color={colors.forest} />
                      <Text style={styles.inlineActionText}>Buscar registrado</Text>
                    </Pressable>
                  ) : null}
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

                <Field
                  value={slot.name}
                  onChangeText={(t) => updateSlot(slot.key, (s) => ({ ...s, name: t }))}
                  placeholder={`Nombre del ${label}`}
                  autoCapitalize="words"
                />

                {searchTargetKey === slot.key ? (
                  <View style={styles.searchDropdown}>
                    <Field
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Escribí nombre o @usuario registrado…"
                      autoFocus
                    />
                    {results.map((u) => (
                      <Pressable key={u.id} accessibilityRole="button" onPress={() => selectRegisteredUser(u)} style={styles.pickRow}>
                        <Avatar name={u.displayName} id={u.id} uri={avatarUrl(u.id, u.avatarV)} size={32} />
                        <View style={styles.flex}>
                          <Text style={styles.playerName}>{u.displayName}</Text>
                          <Text style={type.small}>@{u.username}</Text>
                        </View>
                        <Text style={styles.addChipText}>Elegir</Text>
                      </Pressable>
                    ))}
                    {query.trim().length >= 2 && results.length === 0 ? (
                      <Text style={type.small}>No encontramos jugadores registrados con ese nombre.</Text>
                    ) : null}
                  </View>
                ) : null}
              </Card>
            ) : (
              <Card key={slot.key} style={[styles.playerSlotCard, slot.isMe || slot.joinToken ? styles.confirmed : styles.pending]}>
                <View style={styles.row}>
                  <View style={styles.orderBadge}>
                    <Text style={styles.orderBadgeText}>{index + 1}</Text>
                  </View>
                  <Avatar name={slot.name} id={slot.userId} uri={avatarUrl(slot.userId, slot.avatarV)} size={38} />
                  <View style={styles.flex}>
                    <Text style={styles.playerName}>
                      {label}: {slot.isMe ? `${slot.name} (vos)` : slot.name}
                    </Text>
                    <Text style={type.small}>
                      {slot.isMe || slot.joinToken ? 'Registrado · confirmado para el ranking' : 'Registrado · falta confirmar'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Cambiar o quitar a ${slot.name}`}
                    onPress={() => {
                      if (indSlots.length > 1 && !slot.isMe) {
                        setIndSlots((p) => p.filter((s) => s.key !== slot.key));
                      } else {
                        updateSlot(slot.key, (old) => ({ kind: 'guest', key: old.key, name: '' }));
                      }
                    }}
                    style={styles.inlineRemoveBtn}>
                    <Text style={styles.removeText}>{indSlots.length > 1 && !slot.isMe ? 'Quitar' : 'Cambiar'}</Text>
                  </Pressable>
                </View>

                {!slot.isMe && !slot.joinToken ? (
                  <View style={styles.confirmBox}>
                    <Field
                      value={slot.pw}
                      onChangeText={(t) => updateSlot(slot.key, (s) => ({ ...s, pw: t, error: undefined } as Slot))}
                      placeholder={`Contraseña de ${slot.name}`}
                      secureTextEntry
                      error={slot.error}
                      hint="O puede aceptarla desde su celular al iniciar sesión."
                    />
                    <Button
                      label={slot.busy ? 'Verificando…' : 'Confirmar jugador'}
                      variant="secondary"
                      size="sm"
                      compact
                      icon="lock-closed-outline"
                      disabled={slot.busy || slot.pw.length === 0}
                      onPress={() => confirmWithPassword(slot)}
                    />
                  </View>
                ) : null}
              </Card>
            );
          })}

          {indSlots.length < MAX_PLAYERS ? (
            <View style={styles.actionsWrap}>
              <View style={styles.inlineButtonsRow}>
                <Button
                  label={`Agregar Jugador ${indSlots.length + 1}`}
                  icon="person-add-outline"
                  variant="secondary"
                  size="sm"
                  compact
                  onPress={() => setIndSlots((p) => [...p, makeGuestSlot('')])}
                />
                {token ? (
                  <Button
                    label="Sumar registrado"
                    icon="search-outline"
                    variant="ghost"
                    size="sm"
                    compact
                    onPress={() => {
                      setSearchTargetKey(searchTargetKey === 'add-ind' ? null : 'add-ind');
                      setQuery('');
                    }}
                  />
                ) : null}
              </View>

              {searchTargetKey === 'add-ind' ? (
                <Card style={styles.searchDropdown}>
                  <Field value={query} onChangeText={setQuery} placeholder="Buscar jugador registrado (nombre o @usuario)…" autoFocus />
                  {results.map((u) => (
                    <Pressable key={u.id} accessibilityRole="button" onPress={() => selectRegisteredUser(u)} style={styles.pickRow}>
                      <Avatar name={u.displayName} id={u.id} uri={avatarUrl(u.id, u.avatarV)} size={34} />
                      <View style={styles.flex}>
                        <Text style={styles.playerName}>{u.displayName}</Text>
                        <Text style={type.small}>@{u.username}</Text>
                      </View>
                      <Text style={styles.addChipText}>Agregar</Text>
                    </Pressable>
                  ))}
                  {query.trim().length >= 2 && results.length === 0 ? (
                    <Text style={type.small}>No encontramos a nadie con ese nombre.</Text>
                  ) : null}
                </Card>
              ) : null}

              {!token ? (
                <Pressable accessibilityRole="link" onPress={() => router.push('/ingresar')}>
                  <Text style={styles.link}>Iniciá sesión para sumar jugadores registrados al ranking</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        /* SECCIÓN DE JUGADORES: DÚO (PAREJAS CON DOS CAMPOS LADO A LADO) */
        <View style={styles.field}>
          <View style={styles.sectionHeaderRow}>
            <Text style={type.h2}>{duoPairs.length === 1 ? 'La pareja (Dúo)' : `Parejas (${duoPairs.length} dúos)`}</Text>
            <Text style={type.small}>2 jugadores por dúo</Text>
          </View>

          {duoPairs.map((pair, pairIdx) => (
            <Card key={pair.id} style={styles.duoCard}>
              <View style={styles.duoHeaderRow}>
                <View style={styles.duoTitleWrap}>
                  <Ionicons name="people" size={18} color={colors.forest} />
                  <Text style={styles.duoTitle}>Dúo {pairIdx + 1}</Text>
                </View>
                {duoPairs.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setDuoPairs((prev) => prev.filter((p) => p.id !== pair.id))}
                    style={styles.inlineRemoveBtn}>
                    <Text style={styles.removeText}>Quitar dúo</Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Dos campos uno al lado del otro para los 2 integrantes del Dúo */}
              <View style={styles.duoSideBySide}>
                {([pair.a, pair.b] as const).map((slot, memberIdx) => {
                  const memberLabel = `Jugador ${memberIdx + 1}`;
                  const isSearchingThis = searchTargetKey === slot.key;
                  return (
                    <View key={slot.key} style={styles.duoHalfCol}>
                      <View style={styles.duoColHeader}>
                        <Text style={styles.duoColLabel}>{memberLabel}</Text>
                        {token && slot.kind === 'guest' ? (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              setSearchTargetKey(isSearchingThis ? null : slot.key);
                              setQuery('');
                            }}>
                            <Text style={styles.miniSearchLink}>{isSearchingThis ? 'Cerrar' : 'Registrado'}</Text>
                          </Pressable>
                        ) : null}
                      </View>

                      {slot.kind === 'guest' ? (
                        <Field
                          value={slot.name}
                          onChangeText={(t) => updateSlot(slot.key, (s) => ({ ...s, name: t }))}
                          placeholder={memberLabel}
                          autoCapitalize="words"
                        />
                      ) : (
                        <View style={[styles.duoRegisteredChip, slot.isMe || slot.joinToken ? styles.confirmed : styles.pending]}>
                          <Avatar name={slot.name} id={slot.userId} uri={avatarUrl(slot.userId, slot.avatarV)} size={30} />
                          <View style={styles.flex}>
                            <Text style={styles.duoRegName} numberOfLines={1}>
                              {slot.isMe ? `${slot.name} (vos)` : slot.name}
                            </Text>
                            <Text style={styles.duoRegSub}>
                              {slot.isMe || slot.joinToken ? 'Confirmado' : 'Sin confirmar'}
                            </Text>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => updateSlot(slot.key, (old) => ({ kind: 'guest', key: old.key, name: '' }))}
                            hitSlop={8}>
                            <Ionicons name="close-circle" size={18} color={colors.bad} />
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Si alguno de los 2 slots del Dúo abrió el buscador de registrados */}
              {searchTargetKey === pair.a.key || searchTargetKey === pair.b.key ? (
                <View style={styles.searchDropdown}>
                  <Field
                    value={query}
                    onChangeText={setQuery}
                    placeholder={`Buscar registrado para ${searchTargetKey === pair.a.key ? 'Jugador 1' : 'Jugador 2'}…`}
                    autoFocus
                  />
                  {results.map((u) => (
                    <Pressable key={u.id} accessibilityRole="button" onPress={() => selectRegisteredUser(u)} style={styles.pickRow}>
                      <Avatar name={u.displayName} id={u.id} uri={avatarUrl(u.id, u.avatarV)} size={32} />
                      <View style={styles.flex}>
                        <Text style={styles.playerName}>{u.displayName}</Text>
                        <Text style={type.small}>@{u.username}</Text>
                      </View>
                      <Text style={styles.addChipText}>Seleccionar</Text>
                    </Pressable>
                  ))}
                  {query.trim().length >= 2 && results.length === 0 ? (
                    <Text style={type.small}>No encontramos jugadores registrados con ese nombre.</Text>
                  ) : null}
                </View>
              ) : null}

              {/* Confirmación de contraseña para registrados en el dúo que no sean "yo" */}
              {([pair.a, pair.b] as const).map((slot) =>
                slot.kind === 'registered' && !slot.isMe && !slot.joinToken ? (
                  <View key={`pw-${slot.key}`} style={styles.confirmBox}>
                    <Field
                      value={slot.pw}
                      onChangeText={(t) => updateSlot(slot.key, (s) => ({ ...s, pw: t, error: undefined } as Slot))}
                      placeholder={`Contraseña de ${slot.name} para confirmar`}
                      secureTextEntry
                      error={slot.error}
                    />
                    <Button
                      label={slot.busy ? 'Verificando…' : `Confirmar a ${slot.name}`}
                      variant="secondary"
                      size="sm"
                      compact
                      icon="lock-closed-outline"
                      disabled={slot.busy || slot.pw.length === 0}
                      onPress={() => confirmWithPassword(slot)}
                    />
                  </View>
                ) : null,
              )}
            </Card>
          ))}

          {duoPairs.length < maxPairs ? (
            <View style={styles.inlineButtonsRow}>
              <Button
                label={`Agregar Dúo ${duoPairs.length + 1}`}
                icon="add-circle-outline"
                variant="secondary"
                size="sm"
                compact
                onPress={() =>
                  setDuoPairs((prev) => [...prev, { id: nextKey(), a: makeGuestSlot(''), b: makeGuestSlot('') }])
                }
              />
            </View>
          ) : null}
        </View>
      )}

      {/* FORMATO DE JUEGO (disponible tanto en Individual como en Dúo) */}
      <View style={styles.field}>
        <Text style={type.h2}>Formato de juego</Text>
        {FORMATS.map((f) => {
          const available = isFormatAllowed(f.id);
          const hint =
            mode === 'duo'
              ? 'Disponible para 1 dúo o duelo entre 2 dúos.'
              : 'Necesita exactamente 2 jugadores.';
          return (
            <OptionRow
              key={f.id}
              title={f.name}
              subtitle={available ? f.description : `${f.description} ${hint}`}
              selected={effectiveFormat === f.id}
              disabled={!available}
              onPress={() => setFormat(f.id)}
            />
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  fieldCompact: { gap: 4, marginTop: 4 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  courseCard: {
    backgroundColor: colors.cream,
    borderColor: colors.gold,
    borderWidth: 1.5,
  },
  courseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.forest,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  playerSlotCard: {
    padding: space.sm + 4,
    gap: space.xs + 2,
  },
  slotTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  orderBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
  slotTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.forest,
  },
  inlineActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  inlineActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.forest,
  },
  iconRemove: {
    padding: 2,
  },
  confirmed: { borderColor: colors.moss, borderWidth: 1.5 },
  pending: { borderColor: colors.gold, borderWidth: 1.5, borderStyle: 'dashed' },
  confirmBox: { gap: space.xs, paddingTop: 4 },
  actionsWrap: { gap: space.sm },
  inlineButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
  },
  searchDropdown: {
    gap: space.xs,
    paddingTop: 4,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 46,
    paddingHorizontal: space.sm + 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  playerName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  addChipText: { color: colors.goldDark, fontWeight: '800', fontSize: 13 },
  inlineRemoveBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  removeText: { color: colors.bad, fontWeight: '700', fontSize: 13 },
  link: { color: colors.goldDark, fontWeight: '600', fontSize: 13, paddingVertical: 4, textDecorationLine: 'underline' },
  error: { color: colors.bad, fontWeight: '600', fontSize: 14 },
  duoCard: {
    gap: space.sm,
    borderColor: colors.gold,
    borderWidth: 1.5,
  },
  duoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  duoTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  duoTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: colors.forest,
  },
  duoSideBySide: {
    flexDirection: 'row',
    gap: space.sm,
  },
  duoHalfCol: {
    flex: 1,
    gap: 4,
  },
  duoColHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  duoColLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.forest,
  },
  miniSearchLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.goldDark,
    textDecorationLine: 'underline',
  },
  duoRegisteredChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    backgroundColor: colors.creamLight,
  },
  duoRegName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  duoRegSub: {
    fontSize: 10,
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
});
