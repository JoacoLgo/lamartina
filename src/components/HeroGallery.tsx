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
  'rgba(10, 32, 20, 0.08)',
  'rgba(10, 32, 20, 0.22)',
  'rgba(10, 32, 20, 0.42)',
  'rgba(10, 32, 20, 0.65)',
  'rgba(10, 32, 20, 0.85)',
  '#0A2014',
];

/**
 * Fondo de la sección principal (verde en el boceto):
 * - Si hay 1 o más imágenes activas (en `assets/galeria` o subidas por el admin), pasan cada ~5 segundos
 *   con una transición suave y se difuminan hacia abajo hasta fundirse con el bloque de contacto y redes.
 * - Si no hay imágenes (o el admin las desactiva), mantiene el fondo homogéneo clásico de la app.
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
            <Image source={sources[safePrev]} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
            <Image source={sources[safeIndex]} style={StyleSheet.absoluteFill} contentFit="cover" />
          </Animated.View>
          {/* Velo suave para que el logo, textos y botones se lean perfecto sobre cualquier foto */}
          <View style={styles.photoVeil} />
          {/* Difuminado progresivo hacia el bloque inferior (contorno naranja -> sección de contacto) */}
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
    position: 'relative',
    overflow: 'hidden',
  },
  homogeneous: {
    backgroundColor: 'transparent',
  },
  photoVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248, 244, 234, 0.72)',
  },
  bottomFadeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
    flexDirection: 'column',
  },
  fadeBand: {
    flex: 1,
  },
  foreground: {
    position: 'relative',
    zIndex: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 10,
    zIndex: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(217, 199, 154, 0.4)',
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.goldLight,
  },
});
