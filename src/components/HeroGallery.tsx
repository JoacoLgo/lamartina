import { Image } from 'expo-image';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, type ImageSourcePropType, StyleSheet, View } from 'react-native';

import { LOCAL_GALLERY_IMAGES } from '@/config/galeria';
import { resolveAssetUrl } from '@/lib/api';
import { colors } from '@/theme';

interface Props {
  serverImages?: string[];
  enabled?: boolean;
  intervalSec?: number;
  children: ReactNode;
}

const FADE_STEPS = [
  'rgba(10, 32, 20, 0.0)',
  'rgba(10, 32, 20, 0.06)',
  'rgba(10, 32, 20, 0.14)',
  'rgba(10, 32, 20, 0.24)',
  'rgba(10, 32, 20, 0.34)',
  'rgba(10, 32, 20, 0.42)',
];

/**
 * Fondo de la sección principal:
 * - Si hay 1 o más imágenes activas (en `assets/galeria` o subidas por el admin), pasan cada ~5 segundos
 *   con una transición suave y un desenfoque/velo sutil para que el fondo se aprecie en toda la pantalla,
 *   incluso detrás del bloque de reservas y redes sociales.
 * - Si no hay imágenes (o el admin las desactiva), mantiene el fondo con ondulación suave de la app.
 */
export function HeroGallery({ serverImages = [], enabled = true, intervalSec = 5, children }: Props) {
  const sources: (string | ImageSourcePropType)[] = enabled
    ? [...LOCAL_GALLERY_IMAGES, ...serverImages.map(resolveAssetUrl)]
    : [];

  const [index, setIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (sources.length <= 1) {
      setIndex(0);
      setPrevIndex(null);
      return;
    }
    const ms = Math.max(2000, (intervalSec || 5) * 1000);
    const timer = setInterval(() => {
      setIndex((curr) => {
        const next = (curr + 1) % sources.length;
        setPrevIndex(curr);
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }).start();
        return next;
      });
    }, ms);
    return () => clearInterval(timer);
  }, [sources.length, intervalSec, fadeAnim]);

  const hasImages = sources.length > 0;
  const safeIndex = hasImages ? index % sources.length : 0;
  const safePrev = prevIndex !== null && hasImages ? prevIndex % sources.length : null;

  return (
    <View style={[styles.container, !hasImages && styles.homogeneous]}>
      {hasImages ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {safePrev !== null ? (
            <Image source={sources[safePrev]} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={1.5} />
          ) : null}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
            <Image source={sources[safeIndex]} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={1.5} />
          </Animated.View>
          {/* Velo traslúcido suave para que la foto de fondo se siga viendo pero el texto sea legible */}
          <View style={styles.photoVeil} />
          {/* Sombreado inferior sutil y transparente para no tapar la imagen de fondo */}
          <View style={styles.bottomFadeWrap}>
            {FADE_STEPS.map((bg, i) => (
              <View key={i} style={[styles.fadeBand, { backgroundColor: bg }]} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.foreground}>{children}</View>

      {hasImages && sources.length > 1 ? (
        <View style={styles.dotsRow} pointerEvents="none">
          {sources.map((_, i) => (
            <View key={i} style={[styles.dot, i === safeIndex && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  homogeneous: {
    backgroundColor: 'transparent',
  },
  photoVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248, 244, 234, 0.56)',
  },
  bottomFadeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 180,
    flexDirection: 'column',
  },
  fadeBand: {
    flex: 1,
  },
  foreground: {
    flex: 1,
    position: 'relative',
    zIndex: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 6,
    zIndex: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(217, 199, 154, 0.45)',
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.goldLight,
  },
});
