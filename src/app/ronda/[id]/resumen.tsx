import { Ionicons } from '@expo/vector-icons';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { ScoreMark } from '@/components/ScoreMark';
import { Scorecard } from '@/components/Scorecard';
import { Screen } from '@/components/Screen';
import { duoLeaderboard, duoTotals } from '@/domain/duo';
import { formatInfo } from '@/domain/formats';
import { matchStatus } from '@/domain/match';
import { canWriteRound } from '@/domain/round';
import { formatToPar, holeTotal, isScored, leaderboard } from '@/domain/scoring';
import { courseParTotal, playerStats } from '@/domain/stats';
import type { Hole } from '@/domain/types';
import { generateScorecardPng, type ShareChannel, shareScorecardToChannel } from '@/lib/shareCardImage';
import { useAppStore } from '@/store/useAppStore';
import { syncOnce } from '@/sync/engine';
import { colors, fonts, radius, shadow, space } from '@/theme';

const TROPHY_COLORS: Record<number, string> = {
  1: '#D4AF37',
  2: '#8E9AA8',
  3: '#B87333',
};

interface StandingItem {
  id: string;
  position: number;
  name: string;
  subLabel: string;
  mainValue: string;
  subValue: string;
}

export default function SummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const round = useAppStore((s) => s.rounds.find((r) => r.id === id));
  const me = useAppStore((s) => s.me);
  const reopenRound = useAppStore((s) => s.reopenRound);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [cachedImage, setCachedImage] = useState<{ blob: Blob; dataUrl: string } | null>(null);

  const igHandle = '@lamartina';

  useEffect(() => {
    if (!round || !shareOpen) return;
    let cancelled = false;
    void generateScorecardPng(round, igHandle).then((res) => {
      if (!cancelled && res) setCachedImage(res);
    });
    return () => {
      cancelled = true;
    };
  }, [round, shareOpen]);

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

  const standingItems: StandingItem[] =
    isDuo && duoTeams.length > 0
      ? duoTeams.map((t, idx) => ({
          id: `duo-${t.index}`,
          position: idx + 1,
          name: t.name,
          subLabel: `Dúo ${t.index + 1}`,
          mainValue: isStableford ? `${t.totals.points} pts` : `${t.totals.strokes}`,
          subValue: isStableford ? `${t.totals.strokes} pat.` : formatToPar(t.totals.toPar),
        }))
      : rows.map((r, idx) => ({
          id: r.player.id,
          position: idx + 1,
          name: r.player.name,
          subLabel: !r.player.profileId
            ? 'Invitado'
            : r.player.accepted === false
              ? 'Sin confirmar'
              : 'Registrado',
          mainValue: isStableford ? `${r.totals.points} pts` : `${r.totals.strokes}`,
          subValue: isStableford ? `${r.totals.strokes} pat.` : formatToPar(r.totals.toPar),
        }));

  const frontHoles = round.holes.filter((h) => h.number <= 9);
  const backHoles = round.holes.filter((h) => h.number > 9);
  const totalPar = courseParTotal(round.holes);

  const renderShareBlock = (holesBlock: Hole[], subLabel: string, isBackBlock: boolean) => {
    if (holesBlock.length === 0) return null;
    const blockPar = courseParTotal(holesBlock);
    return (
      <View style={styles.shareTableCard}>
        {/* Encabezado de hoyos */}
        <View style={styles.shareHeadRow}>
          <Text style={[styles.shareHeadText, styles.shareColPlayer]}>HOYO</Text>
          {holesBlock.map((h) => (
            <Text key={h.number} style={[styles.shareHeadText, styles.shareColHole]}>
              {h.number}
            </Text>
          ))}
          <Text style={[styles.shareSubHeadText, styles.shareColSub]}>{subLabel}</Text>
          <Text style={[styles.shareHeadText, styles.shareColTot]}>TOT</Text>
        </View>

        {/* Fila de Par */}
        <View style={styles.shareParRow}>
          <Text style={[styles.shareParLabel, styles.shareColPlayer]}>Par</Text>
          {holesBlock.map((h) => (
            <Text key={h.number} style={[styles.shareParNum, styles.shareColHole]}>
              {h.par}
            </Text>
          ))}
          <Text style={[styles.shareParBold, styles.shareColSub]}>{blockPar}</Text>
          <Text style={[styles.shareParBold, styles.shareColTot]}>{totalPar}</Text>
        </View>

        {/* Filas de jugadores con puesto (1, 2, 3) y su copa de oro, plata o bronce */}
        {rows.map((r, idx) => {
          const rankNum = idx + 1;
          const trophyColor = TROPHY_COLORS[rankNum];
          const p = r.player;
          const t = r.totals;
          const subVal = isBackBlock ? t.backStrokes : t.frontStrokes;
          return (
            <View
              key={p.id}
              style={[
                styles.sharePlayerRow,
                idx % 2 === 1 && styles.sharePlayerRowAlt,
                idx > 0 && styles.sharePlayerRowDivider,
              ]}>
              <View style={[styles.shareColPlayer, styles.sharePlayerCell]}>
                <Text
                  style={[
                    styles.shareRankNum,
                    trophyColor ? { color: rankNum === 1 ? '#9C7416' : trophyColor } : null,
                  ]}>
                  {rankNum}
                </Text>
                {trophyColor ? <Ionicons name="trophy" size={10} color={trophyColor} /> : null}
                <Text style={styles.sharePlayerName} numberOfLines={1}>
                  {p.name}
                </Text>
              </View>

              {holesBlock.map((h) => {
                const s = round.scores[p.id]?.[h.number];
                return (
                  <View key={h.number} style={[styles.shareColHole, styles.shareHoleCenter]}>
                    {isScored(s) ? (
                      <ScoreMark total={holeTotal(s)} par={h.par} size={20} />
                    ) : (
                      <Text style={styles.shareDash}>–</Text>
                    )}
                  </View>
                );
              })}

              <View style={[styles.shareColSub, styles.shareSubBg]}>
                <Text style={styles.shareSubVal}>{subVal || '–'}</Text>
              </View>

              <View style={[styles.shareColTot, styles.shareTotCell]}>
                <Text style={styles.shareTotVal}>{t.strokes || '–'}</Text>
                {t.holesPlayed > 0 ? <Text style={styles.shareToParText}>({formatToPar(t.toPar)})</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const firstPlace = standingItems[0];
  const secondPlace = standingItems[1];
  const thirdAndRest = standingItems.slice(2);

  const handleShareChannel = async (channel: ShareChannel) => {
    setShareBusy(true);
    setShareFeedback(null);
    const res = await shareScorecardToChannel(round, channel, cachedImage, igHandle);
    setShareBusy(false);
    if (res.statusText) setShareFeedback(res.statusText);
  };

  const reopen = () => {
    reopenRound(round.id);
    void syncOnce();
    router.replace({ pathname: '/ronda/[id]', params: { id: round.id } });
  };

  const dateFormatted = new Date(round.startedAt).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Screen
      footer={
        <View style={styles.footerWrap}>
          <Button
            label="Compartir resultado"
            icon="share-social-outline"
            size="sm"
            onPress={() => {
              setShareFeedback(null);
              setShareOpen(true);
            }}
          />
          <View style={styles.footerRow}>
            {canWrite ? (
              <Button label="Corregir" variant="secondary" size="sm" compact style={styles.flex} onPress={reopen} />
            ) : null}
            <Button
              label="Inicio"
              variant="secondary"
              size="sm"
              compact
              style={styles.flex}
              onPress={() => router.replace('/')}
            />
          </View>
        </View>
      }>
      <Stack.Screen options={{ title: 'Final de Partida' }} />

      {/* CABECERA COMPACTA DEL RESUMEN */}
      <View style={styles.topSummaryBanner}>
        <View style={styles.topSummaryLeft}>
          <Text style={styles.topKicker}>
            {isDuo
              ? `DÚO (${round.duoRule === 'sum' ? 'SUMA' : 'MEJOR PELOTA'})`
              : formatInfo(round.format).name.replace(' (medal)', '').toUpperCase()}
            {' · '}
            {round.holes.length} HOYOS
          </Text>
          <Text style={styles.topCourseTitle}>{round.courseName}</Text>
        </View>
        <Text style={styles.topDateBadge}>{dateFormatted}</Text>
      </View>

      {match ? (
        <View style={styles.matchBanner}>
          <Ionicons name="ribbon-outline" size={16} color={colors.goldLight} />
          <Text style={styles.matchBannerTitle} numberOfLines={1}>
            {match.text}
          </Text>
          <Text style={styles.matchBannerSub}>
            ({match.holesPlayed}/{round.holes.length} hoyos)
          </Text>
        </View>
      ) : null}

      {duo && duoTeams.length === 1 ? (
        <View style={styles.matchBanner}>
          <Ionicons name="people" size={16} color={colors.goldLight} />
          <Text style={styles.matchBannerTitle} numberOfLines={1}>
            {round.players.map((p) => p.name).join(' y ')}
          </Text>
          <Text style={styles.matchBannerSub}>
            {duo.strokes} pat. ({formatToPar(duo.toPar)})
          </Text>
        </View>
      ) : null}

      {/* 1. POSICIONES SUELTAS COMO PODIO (SIN RECUADRO): 2º a la izquierda · 1º siempre en el medio · 3º en adelante a la derecha */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>POSICIONES</Text>

        <View style={styles.podiumFreeRow}>
          {/* COLUMNA IZQUIERDA: 2º PUESTO (O ESPACIO PARA MANTENER EL 1º SIEMPRE AL MEDIO) */}
          <View style={styles.podiumSideColLeft}>
            {secondPlace ? (
              <View style={styles.freePlaceRow}>
                <View style={styles.miniPodiumGraphic}>
                  <Ionicons name="trophy" size={13} color="#7B8794" />
                  <View style={styles.silverPedestal}>
                    <Text style={styles.silverPedestalRank}>2º</Text>
                  </View>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.sideName} numberOfLines={1}>
                    {secondPlace.name}
                  </Text>
                  <Text style={styles.sideScore}>
                    {secondPlace.mainValue} <Text style={styles.sideToPar}>({secondPlace.subValue})</Text>
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* COLUMNA CENTRAL: 1º PUESTO SIEMPRE AL MEDIO (MINI PODIO + INFORMACIÓN AL LADO) */}
          {firstPlace ? (
            <View style={styles.podiumCenterCol}>
              <View style={styles.miniPodiumGraphic}>
                <Ionicons name="trophy" size={17} color="#B88917" />
                <View style={styles.goldPedestal}>
                  <Text style={styles.goldPedestalRank}>1º</Text>
                </View>
              </View>

              <View style={styles.championInfoCol}>
                <Text style={styles.championLabel}>1º PUESTO</Text>
                <Text style={styles.championName} numberOfLines={1}>
                  {firstPlace.name}
                </Text>
                <View style={styles.championScoreRow}>
                  <Text style={styles.championScoreMain}>{firstPlace.mainValue}</Text>
                  <View style={styles.championToParPill}>
                    <Text style={styles.championToParText}>{firstPlace.subValue}</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {/* COLUMNA DERECHA: 3º PUESTO EN ADELANTE (O ESPACIO PARA MANTENER EL 1º SIEMPRE AL MEDIO) */}
          <View style={styles.podiumSideColRight}>
            {thirdAndRest.map((item, idx) => (
              <View
                key={item.id}
                style={[styles.freePlaceRow, idx > 0 && styles.rightListItemSpacing]}>
                {item.position === 3 ? (
                  <View style={styles.miniPodiumGraphic}>
                    <Ionicons name="trophy" size={12} color="#A96835" />
                    <View style={styles.bronzePedestal}>
                      <Text style={styles.bronzePedestalRank}>3º</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.neutralPosBadge}>
                    <Text style={styles.neutralPosText}>{item.position}º</Text>
                  </View>
                )}
                <View style={styles.flex}>
                  <Text style={styles.sideNameSmall} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.sideScoreSmall}>
                    {item.mainValue} <Text style={styles.sideToPar}>({item.subValue})</Text>
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {unconfirmed.length > 0 ? (
          <Text style={styles.noticeHint}>
            {unconfirmed.map((p) => p.name).join(', ')} no confirmó la ronda (no suma al ranking).
          </Text>
        ) : guests.length > 0 ? (
          <Text style={styles.noticeHint}>
            {countable.length === 0
              ? 'Partida amistosa de invitados (no suma al ranking).'
              : 'Solo los jugadores con cuenta activa suman al ranking.'}
          </Text>
        ) : null}
      </View>

      {/* 2. TARJETA OFICIAL DE LA RONDA */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>TARJETA DE LA PARTIDA</Text>
          <Text style={styles.legendMini}>◯ Bajo par · ▢ Sobre par</Text>
        </View>
        <Scorecard round={round} showPositions />
      </View>

      {/* 3. ESTADÍSTICAS POR JUGADOR EN TABLA COMPARATIVA COMPACTA */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ESTADÍSTICAS POR JUGADOR</Text>
        <View style={styles.statsTableWrap}>
          {/* Encabezado de columnas */}
          <View style={styles.statsTableHead}>
            <Text style={[styles.statsHeadText, styles.statsColName]}>Jugador</Text>
            <Text style={[styles.statsHeadText, styles.statsColNum]}>Prom.</Text>
            <Text style={[styles.statsHeadText, styles.statsColNum]}>Bajo par</Text>
            <Text style={[styles.statsHeadText, styles.statsColNum]}>Pares</Text>
            <Text style={[styles.statsHeadText, styles.statsColNum]}>Bogeys</Text>
            <Text style={[styles.statsHeadText, styles.statsColNum]}>+2/Pen</Text>
          </View>

          {round.players.map((p, idx) => {
            const s = playerStats(round, p.id);
            const underParCount =
              s.counts['hole-in-one'] + s.counts.albatross + s.counts.eagle + s.counts.birdie;
            const parCount = s.counts.par;
            const bogeyCount = s.counts.bogey;
            const worseCount = s.counts['double-bogey'] + s.counts.worse;

            return (
              <View
                key={p.id}
                style={[styles.statsTableRow, idx > 0 && styles.statsTableRowBorder]}>
                <View style={styles.statsColName}>
                  <Text style={styles.statsPlayerName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {round.holes.length === 18 ? (
                    <Text style={styles.statsSplitSub}>
                      I:{s.frontStrokes} · V:{s.backStrokes}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.statsColNum}>
                  <Text style={styles.statsAvgVal}>
                    {s.averagePerHole > 0 ? s.averagePerHole.toFixed(1) : '–'}
                  </Text>
                </View>

                <View style={styles.statsColNum}>
                  <View style={[styles.statCountPill, underParCount > 0 && styles.statPillGood]}>
                    <Text style={[styles.statCountText, underParCount > 0 && styles.statTextGood]}>
                      {underParCount}
                    </Text>
                  </View>
                </View>

                <View style={styles.statsColNum}>
                  <View style={[styles.statCountPill, parCount > 0 && styles.statPillPar]}>
                    <Text style={[styles.statCountText, parCount > 0 && styles.statTextPar]}>
                      {parCount}
                    </Text>
                  </View>
                </View>

                <View style={styles.statsColNum}>
                  <View style={[styles.statCountPill, bogeyCount > 0 && styles.statPillBad]}>
                    <Text style={[styles.statCountText, bogeyCount > 0 && styles.statTextBad]}>
                      {bogeyCount}
                    </Text>
                  </View>
                </View>

                <View style={styles.statsColNum}>
                  <Text style={styles.statsWorseVal}>
                    {worseCount}
                    {s.penalties > 0 ? ` (${s.penalties}p)` : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* MODAL DE COMPARTIR TARJETA AESTHETIC EN REDES SOCIALES */}
      <Modal
        visible={shareOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setShareOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShareOpen(false)} />

          <View style={styles.shareModalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Compartir tarjeta</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                onPress={() => setShareOpen(false)}
                hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>

            {/* VISTA PREVIA AESTHETIC DE LA TARJETA ("La Martina" arriba, "footgolf" chiquito abajo, líneas suaves y @lamartina al pie) */}
            <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewScrollContent}>
              <View style={styles.aestheticOuterFrame}>
                <View style={styles.aestheticInnerFrame}>
                  {/* Marca centrada con líneas suaves */}
                  <View style={styles.aestheticBrandHeader}>
                    <Text style={styles.aestheticBrandTitle}>La Martina</Text>
                    <View style={styles.aestheticSubLineRow}>
                      <View style={styles.aestheticSoftLine} />
                      <Text style={styles.aestheticBrandSub}>FOOTGOLF</Text>
                      <View style={styles.aestheticSoftLine} />
                    </View>
                    <Text style={styles.aestheticDateText}>
                      {dateFormatted} · {round.holes.length} hoyos
                    </Text>
                  </View>

                  {/* Tarjeta completa de alta nitidez (sin recortes laterales) con posiciones 1, 2, 3 y copas en cada nombre */}
                  {renderShareBlock(frontHoles, 'IDA', false)}
                  {backHoles.length > 0 ? renderShareBlock(backHoles, 'VTA', true) : null}

                  {/* Pie con @lamartina y líneas suaves */}
                  <View style={styles.aestheticFooterRow}>
                    <View style={styles.aestheticSoftLine} />
                    <View style={styles.aestheticIgBadge}>
                      <Ionicons name="logo-instagram" size={13} color={colors.forestDeep} />
                      <Text style={styles.aestheticIgText}>{igHandle}</Text>
                    </View>
                    <View style={styles.aestheticSoftLine} />
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.socialButtonsGrid}>
              <Pressable
                accessibilityRole="button"
                disabled={shareBusy}
                onPress={() => void handleShareChannel('instagram')}
                style={({ pressed }) => [styles.socialBtn, styles.socialInstagram, pressed && { opacity: 0.85 }]}>
                <Ionicons name="logo-instagram" size={18} color="#FFFFFF" />
                <Text style={styles.socialBtnTextLight}>Instagram</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={shareBusy}
                onPress={() => void handleShareChannel('whatsapp')}
                style={({ pressed }) => [styles.socialBtn, styles.socialWhatsapp, pressed && { opacity: 0.85 }]}>
                <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
                <Text style={styles.socialBtnTextLight}>WhatsApp</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={shareBusy}
                onPress={() => void handleShareChannel('facebook')}
                style={({ pressed }) => [styles.socialBtn, styles.socialFacebook, pressed && { opacity: 0.85 }]}>
                <Ionicons name="logo-facebook" size={18} color="#FFFFFF" />
                <Text style={styles.socialBtnTextLight}>Facebook</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={shareBusy}
                onPress={() => void handleShareChannel('native')}
                style={({ pressed }) => [styles.socialBtn, styles.socialMore, pressed && { opacity: 0.85 }]}>
                <Ionicons name="share-social" size={18} color={colors.forestDeep} />
                <Text style={styles.socialBtnTextDark}>Más redes</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={shareBusy}
              onPress={() => void handleShareChannel('download')}
              style={({ pressed }) => [styles.downloadBarBtn, pressed && { opacity: 0.85 }]}>
              <Ionicons name="download-outline" size={16} color={colors.forest} />
              <Text style={styles.downloadBarText}>Guardar imagen de la tarjeta (PNG)</Text>
            </Pressable>

            {shareFeedback ? <Text style={styles.shareFeedbackText}>{shareFeedback}</Text> : null}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  section: { gap: 6 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.goldDark,
  },
  legendMini: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.muted,
  },
  topSummaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: radius.md,
    backgroundColor: colors.forestDeep,
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  topSummaryLeft: {
    flex: 1,
    gap: 1,
  },
  topKicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.goldLight,
  },
  topCourseTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: colors.cream,
  },
  topDateBadge: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.goldLight,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  matchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.forest,
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  matchBannerTitle: {
    flex: 1,
    color: colors.cream,
    fontFamily: fonts.serif,
    fontSize: 15,
    fontWeight: '700',
  },
  matchBannerSub: {
    color: colors.goldLight,
    fontSize: 11.5,
    fontWeight: '600',
  },
  /* PODIO SUELTO (SIN RECUADRO): 2º izquierda | 1º siempre en el centro con mini podio | 3º+ derecha */
  podiumFreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 2,
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  podiumSideColLeft: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-end',
  },
  podiumCenterCol: {
    flex: 1.25,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 2,
  },
  podiumSideColRight: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-end',
    gap: 6,
  },
  freePlaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  rightListItemSpacing: {
    paddingTop: 2,
  },
  miniPodiumGraphic: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  goldPedestal: {
    width: 32,
    height: 26,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: '#F3DF9D',
    borderWidth: 1,
    borderColor: '#C79F27',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldPedestalRank: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#7A590B',
  },
  silverPedestal: {
    width: 26,
    height: 19,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: '#E2E6EC',
    borderWidth: 1,
    borderColor: '#9AA5B1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  silverPedestalRank: {
    fontSize: 10,
    fontWeight: '900',
    color: '#465462',
  },
  bronzePedestal: {
    width: 24,
    height: 16,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: '#F2E0CF',
    borderWidth: 1,
    borderColor: '#C07A45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bronzePedestalRank: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#80471C',
  },
  sideName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  sideScore: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.forest,
    fontVariant: ['tabular-nums'],
  },
  sideToPar: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.muted,
  },
  championInfoCol: {
    flexShrink: 1,
    minWidth: 0,
    gap: 1,
  },
  championLabel: {
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: '#9C7416',
  },
  championName: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  championScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  championScoreMain: {
    fontSize: 15.5,
    fontWeight: '900',
    color: colors.forestDeep,
    fontVariant: ['tabular-nums'],
  },
  championToParPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: '#FAF0CA',
  },
  championToParText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#8B6510',
  },
  neutralPosBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.creamLight,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  neutralPosText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.forest,
  },
  sideNameSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  sideScoreSmall: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.forest,
    fontVariant: ['tabular-nums'],
  },
  noticeHint: {
    fontSize: 11,
    color: colors.muted,
  },
  /* TABLA COMPARATIVA DE ESTADÍSTICAS */
  statsTableWrap: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  statsTableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    backgroundColor: colors.forestDeep,
    paddingHorizontal: 10,
  },
  statsHeadText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.goldLight,
    textAlign: 'center',
  },
  statsTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 38,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  statsTableRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  statsColName: {
    flex: 1.4,
    minWidth: 0,
    textAlign: 'left',
    paddingRight: 4,
  },
  statsColNum: {
    flex: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsPlayerName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  statsSplitSub: {
    fontSize: 9.5,
    fontWeight: '600',
    color: colors.muted,
  },
  statsAvgVal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.forestDeep,
    fontVariant: ['tabular-nums'],
  },
  statCountPill: {
    minWidth: 24,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.creamLight,
    alignItems: 'center',
  },
  statPillGood: {
    backgroundColor: '#E9F5EC',
  },
  statPillPar: {
    backgroundColor: '#EEF2EC',
  },
  statPillBad: {
    backgroundColor: '#FBECEB',
  },
  statCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  statTextGood: {
    color: colors.good,
  },
  statTextPar: {
    color: colors.forest,
  },
  statTextBad: {
    color: colors.bad,
  },
  statsWorseVal: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  footerWrap: {
    gap: 6,
  },
  footerRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  /* MODAL DE COMPARTIR Y TARJETA AESTHETIC */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(13, 28, 18, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 20,
  },
  shareModalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '92%',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.gold,
    padding: 14,
    gap: 10,
    ...shadow,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  modalTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: colors.forestDeep,
  },
  previewScroll: {
    maxHeight: 360,
  },
  previewScrollContent: {
    paddingVertical: 2,
  },
  aestheticOuterFrame: {
    borderRadius: 18,
    backgroundColor: '#FAF6EC',
    borderWidth: 1.5,
    borderColor: 'rgba(182, 152, 92, 0.72)',
    padding: 5,
  },
  aestheticInnerFrame: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(20, 51, 33, 0.18)',
    paddingVertical: 11,
    paddingHorizontal: 8,
    gap: 8,
  },
  shareTableCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(182, 152, 92, 0.55)',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  shareHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    backgroundColor: '#12311F',
  },
  shareHeadText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FAF6EC',
    textAlign: 'center',
  },
  shareSubHeadText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#E6CE97',
    textAlign: 'center',
  },
  shareParRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
    backgroundColor: '#F5EFE0',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(205, 194, 170, 0.65)',
  },
  shareParLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#6A7368',
  },
  shareParNum: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#6A7368',
    textAlign: 'center',
  },
  shareParBold: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#12311F',
    textAlign: 'center',
  },
  sharePlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 30,
    backgroundColor: '#FFFFFF',
  },
  sharePlayerRowAlt: {
    backgroundColor: '#FCFBF7',
  },
  sharePlayerRowDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(205, 194, 170, 0.5)',
  },
  shareColPlayer: {
    width: 82,
    paddingLeft: 6,
    paddingRight: 2,
    textAlign: 'left',
  },
  shareColHole: {
    flex: 1,
    minWidth: 18,
  },
  shareColSub: {
    width: 28,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(205, 194, 170, 0.5)',
  },
  shareColTot: {
    width: 44,
  },
  sharePlayerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  shareRankNum: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  sharePlayerName: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  shareHoleCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareDash: {
    fontSize: 10,
    color: colors.muted,
  },
  shareSubBg: {
    height: '100%',
    minHeight: 30,
    backgroundColor: '#F6F0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareSubVal: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.forestDeep,
    fontVariant: ['tabular-nums'],
  },
  shareTotCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  shareTotVal: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.forestDeep,
    fontVariant: ['tabular-nums'],
  },
  shareToParText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: colors.goldDark,
  },
  aestheticBrandHeader: {
    alignItems: 'center',
    gap: 2,
  },
  aestheticBrandTitle: {
    fontFamily: fonts.serif,
    fontSize: 28,
    fontWeight: '700',
    color: colors.forestDeep,
    letterSpacing: 0.3,
  },
  aestheticSubLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -2,
  },
  aestheticSoftLine: {
    width: 38,
    height: 1,
    backgroundColor: 'rgba(182, 152, 92, 0.65)',
  },
  aestheticBrandSub: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 3,
    color: colors.goldDark,
  },
  aestheticDateText: {
    fontSize: 10.5,
    color: colors.muted,
    marginTop: 2,
  },
  aestheticFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 2,
  },
  aestheticIgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aestheticIgText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.forestDeep,
  },
  socialButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  socialBtn: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
  },
  socialInstagram: {
    backgroundColor: '#C13584',
  },
  socialWhatsapp: {
    backgroundColor: '#1FAF54',
  },
  socialFacebook: {
    backgroundColor: '#1877F2',
  },
  socialMore: {
    backgroundColor: colors.goldLight,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  socialBtnTextLight: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  socialBtnTextDark: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.forestDeep,
  },
  downloadBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.line,
  },
  downloadBarText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.forest,
  },
  shareFeedbackText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.forest,
    textAlign: 'center',
  },
});
