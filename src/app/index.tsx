import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { HeroGallery } from '@/components/HeroGallery';
import type { IconName } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { WeatherCompass } from '@/components/WeatherCompass';
import { pendingPlayerFor } from '@/domain/round';
import { standingsText } from '@/domain/stats';
import { avatarUrl } from '@/lib/api';
import { openUrl } from '@/lib/maps';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius, shadow, space, type } from '@/theme';

const DOCKED_LOGO_SIZE = 80;
const LARGE_LOGO_SIZE = 224;
const DOCK_TOP = 10;
const DOCK_LEFT = space.md;
const DOCK_CENTER_X = DOCK_LEFT + DOCKED_LOGO_SIZE / 2;
const DOCK_CENTER_Y = DOCK_TOP + DOCKED_LOGO_SIZE / 2;

let hasPlayedIntroOnce = false;

function Tile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}>
      <View style={styles.tileIconWrap}>
        <Ionicons name={icon} size={20} color={colors.forest} />
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const windowDims = useWindowDimensions();
  const me = useAppStore((s) => s.me);
  const config = useAppStore((s) => s.config);
  const rounds = useAppStore((s) => s.rounds);
  const online = useAppStore((s) => s.online);
  const outbox = useAppStore((s) => s.outbox);

  const active = rounds.find((r) => !r.finishedAt);
  const invited = active ? pendingPlayerFor(active, me?.id) : undefined;
  const isAdmin = me?.role === 'admin';
  const v = config.venue;

  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const [introComplete, setIntroComplete] = useState(hasPlayedIntroOnce);
  const hasStartedRef = useRef(hasPlayedIntroOnce);

  const logoAppear = useRef(new Animated.Value(hasPlayedIntroOnce ? 1 : 0)).current;
  const logoProgress = useRef(new Animated.Value(hasPlayedIntroOnce ? 1 : 0)).current;
  const contentProgress = useRef(new Animated.Value(hasPlayedIntroOnce ? 1 : 0)).current;

  const playIntroAnimation = useCallback(() => {
    setIntroComplete(false);
    logoAppear.setValue(0);
    logoProgress.setValue(0);
    contentProgress.setValue(0);

    Animated.sequence([
      // 1. Aparición suave del escudo completo en el centro
      Animated.timing(logoAppear, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // 2. Pausa tranquila en el centro para apreciar el logo sobre el fondo bicolor
      Animated.delay(850),
      // 3. Desplazamiento lento y fluido hacia la esquina superior izquierda (sin mostrar ningún cartel aún)
      Animated.timing(logoProgress, {
        toValue: 1,
        duration: 1900,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      // 4. Recién cuando terminó de minimizarse por completo, aparecen Iniciar sesión, Cómo llegar, Clima y el resto
      Animated.timing(contentProgress, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        hasPlayedIntroOnce = true;
        setIntroComplete(true);
      }
    });
  }, [contentProgress, logoAppear, logoProgress]);

  const onStageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setStageSize({ width, height });
    }
  };

  useEffect(() => {
    if (stageSize && !hasStartedRef.current) {
      hasStartedRef.current = true;
      playIntroAnimation();
    }
  }, [stageSize, playIntroAnimation]);

  const effectiveWidth = stageSize?.width ?? windowDims.width;
  const effectiveHeight = stageSize?.height ?? Math.max(540, windowDims.height - 64);

  // Centro inicial del logo (mitad de pantalla sobre la unión blanco/onda verde) -> Centro final (esquina sup. izquierda)
  const startX = Math.max(0, effectiveWidth / 2 - DOCK_CENTER_X);
  const startY = Math.max(90, effectiveHeight * 0.36 - DOCK_CENTER_Y);
  const dockedScale = DOCKED_LOGO_SIZE / LARGE_LOGO_SIZE;

  const logoTranslateX = logoProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [startX, 0],
  });
  const logoTranslateY = logoProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [startY, 0],
  });
  const logoMoveScale = logoProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, dockedScale],
  });
  const logoEntranceScale = logoAppear.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });
  const combinedLogoScale = Animated.multiply(logoMoveScale, logoEntranceScale);

  const contentOpacity = contentProgress;
  const contentSlideY = contentProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
  });
  const topBarSlideY = contentProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-10, 0],
  });

  const openActive = () => active && router.push({ pathname: '/ronda/[id]', params: { id: active.id } });

  return (
    <View style={styles.root}>
      {/* Barra superior compacta: los botones de Iniciar sesión y Cómo llegar recién aparecen al terminar de minimizarse el logo */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Animated.View
          pointerEvents={introComplete ? 'auto' : 'none'}
          style={[
            styles.topBarInner,
            {
              opacity: contentOpacity,
              transform: [{ translateY: topBarSlideY }],
            },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={me ? 'Mi perfil' : 'Iniciar sesión'}
            onPress={() => router.push(me ? '/perfil' : '/ingresar')}
            style={styles.profileChip}>
            {me ? (
              <Avatar name={me.displayName} id={me.id} uri={avatarUrl(me.id, me.avatarV)} size={30} />
            ) : (
              <Ionicons name="log-in-outline" size={24} color={colors.cream} />
            )}
            <Text style={styles.profileText} numberOfLines={1}>
              {me ? me.displayName : 'Iniciar sesión'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cómo llegar a la cancha"
            onPress={() => router.push('/como-llegar')}
            style={({ pressed }) => [styles.mapButton, pressed && { opacity: 0.85 }]}>
            <Ionicons name="location" size={16} color={colors.forestDeep} />
            <Text style={styles.mapText}>Cómo llegar</Text>
          </Pressable>
        </Animated.View>
      </View>

      {/* Escenario principal con fondo crema arriba y ondulación verde abajo */}
      <View style={styles.stage} onLayout={onStageLayout}>
        {/* Fondo con ondulación verde en la parte inferior para contraste con el logo y secciones */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.upperCreamBg} />
          <View style={styles.lowerGreenBg}>
            {/* Ondulación suave (tres curvas superpuestas en tonos verde y dorado del logo) */}
            <View style={styles.waveRimGold} />
            <View style={styles.waveCrestMoss} />
            <View style={styles.waveMainForest} />
          </View>
        </View>

        {/* Logo animado en alta resolución completa: inicia grande en el centro y se minimiza con fluidez hacia la esquina superior izquierda */}
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.floatingLogoWrap,
            {
              opacity: logoAppear,
              transform: [
                { translateX: logoTranslateX },
                { translateY: logoTranslateY },
                { scale: combinedLogoScale },
              ],
            },
          ]}>
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel="Logo de La Martina Footgolf (tocar para repetir animación)"
            onPress={playIntroAnimation}
            style={styles.logoHalo}>
            <Logo size={LARGE_LOGO_SIZE} />
          </Pressable>
        </Animated.View>

        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          pointerEvents={introComplete ? 'auto' : 'none'}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {/* PARTE SUPERIOR (BLANCO / CREMA O CARRUSEL DE FOTOS DEL ADMIN) */}
          <HeroGallery serverImages={v.heroImages} enabled={v.heroEnabled} intervalSec={v.heroIntervalSec}>
            <Animated.View
              style={[
                styles.upperContent,
                {
                  opacity: contentOpacity,
                  transform: [{ translateY: contentSlideY }],
                },
              ]}>
              {/* Fila 1: Espacio del logo minimizado a la izquierda + Rosa de los vientos y clima alargado a la derecha */}
              <View style={styles.topHeaderRow}>
                <View style={styles.logoDockPlaceholder} />
                <WeatherCompass coords={v.gate} />
              </View>

              {/* Fila 2: Bienvenida y descripción concisa */}
              <View style={styles.welcomeBlock}>
                <Text style={styles.welcomeTitle}>
                  {me ? `¡Bienvenido, ${me.displayName}!` : 'La Martina Footgolf'}
                </Text>
                <Text style={styles.tagline} numberOfLines={2}>
                  {v.tagline || 'Anotá tu ronda, seguí tu puntaje y competí en el ranking de la cancha.'}
                </Text>
              </View>

              {config.announcement ? (
                <View style={styles.announcement} accessibilityRole="alert">
                  <Ionicons name="megaphone-outline" size={18} color={colors.goldDark} />
                  <Text style={styles.announcementText} numberOfLines={2}>
                    {config.announcement}
                  </Text>
                </View>
              ) : null}

              {me && !online ? (
                <Text style={styles.offline}>
                  Sin señal: tus puntajes se guardan en el celular{outbox.length > 0 ? ` (${outbox.length} pend.)` : ''}.
                </Text>
              ) : null}

              {/* Acción principal: Empezar a jugar o Continuar ronda */}
              {active ? (
                <Pressable onPress={openActive} style={styles.activeCompactCard}>
                  <View style={styles.flex}>
                    <Text style={styles.activeLabel}>
                      {invited ? 'TE SUMARON A UNA RONDA' : `RONDA EN CURSO · HOYO ${active.currentHole}/${active.holes.length}`}
                    </Text>
                    <Text style={styles.activeSub} numberOfLines={1}>
                      {standingsText(active)}
                    </Text>
                  </View>
                  <Button label={invited ? 'Aceptar' : 'Continuar'} icon="play" size="sm" onPress={openActive} />
                </Pressable>
              ) : (
                <Button label="Empezar a jugar" icon="football-outline" onPress={() => router.push('/ronda/nueva')} />
              )}

              {/* Accesos rápidos en una sola fila compacta */}
              <View style={styles.tilesRow}>
                <Tile icon="trophy-outline" label="Ranking" onPress={() => router.push('/ranking')} />
                <Tile
                  icon="time-outline"
                  label="Mis partidas"
                  onPress={() => router.push(me ? '/historial' : '/ingresar')}
                />
                <Tile icon="book-outline" label="Cómo se juega" onPress={() => router.push('/reglas')} />
                {isAdmin ? <Tile icon="settings-outline" label="Admin" onPress={() => router.push('/admin')} /> : null}
              </View>

              {/* Invitación a crear perfil con la frase completa sin cortarse */}
              {!me ? (
                <View style={styles.guestStrip}>
                  <View style={styles.flex}>
                    <Text style={styles.guestStripTitle}>Jugás como invitado</Text>
                    <Text style={styles.guestStripSub}>
                      Creá tu perfil para sumar al ranking y guardar tu historial de partidas.
                    </Text>
                  </View>
                  <Button
                    label="Crear mi perfil"
                    variant="secondary"
                    size="sm"
                    icon="person-add-outline"
                    onPress={() => router.push('/registro')}
                  />
                </View>
              ) : active ? (
                <View style={styles.newRoundInline}>
                  <Button label="Empezar otra ronda nueva" variant="ghost" size="sm" compact onPress={() => router.push('/ronda/nueva')} />
                </View>
              ) : null}
            </Animated.View>
          </HeroGallery>

          {/* PARTE INFERIOR SOBRE LA ONDULACIÓN VERDE: RESERVAS, REDES SOCIALES Y EQUIPO LOCAL */}
          <Animated.View
            style={[
              styles.lowerGreenContent,
              {
                opacity: contentOpacity,
                transform: [{ translateY: contentSlideY }],
              },
            ]}>
            <View style={styles.footerCard}>
              <View style={styles.footerTopRow}>
                <View style={styles.flex}>
                  <View style={styles.footerHeader}>
                    <Ionicons name="calendar-outline" size={14} color={colors.goldLight} />
                    <Text style={styles.footerLabel}>Reservas, consultas y redes</Text>
                  </View>
                  <Text style={styles.footerTitle}>{v.name} Footgolf</Text>
                  <Text style={styles.footerSub} numberOfLines={1}>
                    {v.address}
                    {v.hours ? ` · ${v.hours}` : ''}
                  </Text>
                </View>

                {/* Botones rápidos de contacto (WhatsApp / Teléfono) */}
                <View style={styles.contactButtonsWrap}>
                  {v.whatsapp ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openUrl(`https://wa.me/${v.whatsapp}`)}
                      style={({ pressed }) => [styles.whatsappPill, pressed && { opacity: 0.85 }]}>
                      <Ionicons name="logo-whatsapp" size={16} color={colors.forestDeep} />
                      <Text style={styles.whatsappPillText}>WhatsApp</Text>
                    </Pressable>
                  ) : null}
                  {v.phone ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openUrl(`tel:${v.phone.replace(/\s/g, '')}`)}
                      style={({ pressed }) => [styles.phonePill, pressed && { opacity: 0.85 }]}>
                      <Ionicons name="call-outline" size={15} color={colors.goldLight} />
                      <Text style={styles.phonePillText}>{v.phone}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {/* Redes sociales de La Martina en fila horizontal compacta */}
              <View style={styles.socialRow}>
                {v.instagram ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => openUrl(v.instagram)}
                    style={({ pressed }) => [styles.socialChip, pressed && { opacity: 0.85 }]}>
                    <Ionicons name="logo-instagram" size={17} color={colors.goldLight} />
                    <Text style={styles.socialHandle} numberOfLines={1}>
                      @lamartinafootgolf
                    </Text>
                  </Pressable>
                ) : null}

                {v.tiktok ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => openUrl(v.tiktok)}
                    style={({ pressed }) => [styles.socialChip, pressed && { opacity: 0.85 }]}>
                    <Ionicons name="logo-tiktok" size={16} color={colors.goldLight} />
                    <Text style={styles.socialHandle} numberOfLines={1}>
                      @lamartinafootgolf
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Equipo local: Punteros F.C. */}
              {v.teamName ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => v.teamInstagram && openUrl(v.teamInstagram)}
                  style={({ pressed }) => [styles.teamBanner, pressed && { opacity: 0.9 }]}>
                  <View style={styles.teamBadgeIcon}>
                    <Ionicons name="shield-checkmark" size={18} color={colors.forestDeep} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.teamLabel} numberOfLines={1}>
                      {v.teamDescription || 'El primer equipo puntaltense de Footgolf'}
                    </Text>
                    <Text style={styles.teamName} numberOfLines={1}>
                      {v.teamName} <Text style={styles.teamHandleInline}>· @punteros.f.c</Text>
                    </Text>
                  </View>
                  <Ionicons name="logo-instagram" size={18} color={colors.goldLight} />
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.forestDeep,
  },
  flex: { flex: 1 },
  topBar: {
    paddingHorizontal: space.md,
    paddingBottom: 8,
    backgroundColor: colors.forestDeep,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(160, 136, 88, 0.35)',
    zIndex: 50,
  },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  profileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 38,
    flexShrink: 1,
  },
  profileText: {
    color: colors.cream,
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.goldLight,
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  mapText: {
    color: colors.forestDeep,
    fontSize: 13,
    fontWeight: '700',
  },
  stage: {
    flex: 1,
    position: 'relative',
    backgroundColor: colors.creamLight,
    overflow: 'hidden',
  },
  upperCreamBg: {
    height: 360,
    backgroundColor: colors.creamLight,
  },
  lowerGreenBg: {
    flex: 1,
    backgroundColor: colors.forestDeep,
    position: 'relative',
  },
  waveRimGold: {
    position: 'absolute',
    top: -38,
    left: -50,
    right: -50,
    height: 88,
    borderTopLeftRadius: 280,
    borderTopRightRadius: 220,
    backgroundColor: colors.gold,
    opacity: 0.45,
    transform: [{ rotate: '-2deg' }],
  },
  waveCrestMoss: {
    position: 'absolute',
    top: -30,
    left: -40,
    right: -60,
    height: 84,
    borderTopLeftRadius: 240,
    borderTopRightRadius: 300,
    backgroundColor: colors.moss,
    opacity: 0.55,
    transform: [{ rotate: '1.5deg' }],
  },
  waveMainForest: {
    position: 'absolute',
    top: -20,
    left: -45,
    right: -45,
    bottom: 0,
    borderTopLeftRadius: 260,
    borderTopRightRadius: 260,
    backgroundColor: colors.forestDeep,
  },
  floatingLogoWrap: {
    position: 'absolute',
    top: DOCK_CENTER_Y - LARGE_LOGO_SIZE / 2,
    left: DOCK_CENTER_X - LARGE_LOGO_SIZE / 2,
    width: LARGE_LOGO_SIZE,
    height: LARGE_LOGO_SIZE,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  logoHalo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    gap: 10,
  },
  upperContent: {
    paddingHorizontal: space.md,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 10,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: DOCKED_LOGO_SIZE,
    zIndex: 30,
  },
  logoDockPlaceholder: {
    width: DOCKED_LOGO_SIZE,
    height: DOCKED_LOGO_SIZE,
  },
  welcomeBlock: {
    gap: 2,
    paddingHorizontal: 2,
  },
  welcomeTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
  },
  tagline: {
    fontFamily: fonts.serif,
    fontSize: 14,
    lineHeight: 19,
    color: colors.muted,
  },
  announcement: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.cream,
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  announcementText: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    fontWeight: '600',
  },
  offline: {
    ...type.small,
    fontSize: 12,
    textAlign: 'center',
    color: colors.goldDark,
  },
  activeCompactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.gold,
  },
  activeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.goldDark,
  },
  activeSub: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 253, 248, 0.96)',
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow,
  },
  tileIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.forest,
    textAlign: 'center',
  },
  guestStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 253, 248, 0.96)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  guestStripTitle: {
    fontFamily: fonts.serif,
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.ink,
  },
  guestStripSub: {
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.muted,
  },
  newRoundInline: {
    alignItems: 'center',
  },
  lowerGreenContent: {
    paddingHorizontal: space.md,
    paddingTop: 2,
    paddingBottom: 8,
  },
  footerCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.forest,
    borderWidth: 1.5,
    borderColor: colors.gold,
    padding: 12,
    gap: 8,
    ...shadow,
  },
  footerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  footerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  footerLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.goldLight,
  },
  footerTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: colors.cream,
  },
  footerSub: {
    fontSize: 12,
    color: colors.cream,
    opacity: 0.88,
  },
  contactButtonsWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  whatsappPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.goldLight,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  whatsappPillText: {
    color: colors.forestDeep,
    fontWeight: '800',
    fontSize: 12,
  },
  phonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.forestDeep,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  phonePillText: {
    color: colors.cream,
    fontWeight: '700',
    fontSize: 12,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 8,
  },
  socialChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.forestDeep,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  socialHandle: {
    color: colors.cream,
    fontWeight: '700',
    fontSize: 12,
  },
  teamBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.forestDeep,
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  teamBadgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamLabel: {
    color: colors.goldLight,
    fontSize: 9.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  teamName: {
    fontFamily: fonts.serif,
    color: colors.cream,
    fontSize: 15,
    fontWeight: '700',
  },
  teamHandleInline: {
    fontFamily: 'System',
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.goldLight,
  },
});
