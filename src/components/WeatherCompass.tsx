import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/components/icons';
import type { LatLng } from '@/domain/config';
import { colors, fonts, radius, shadow, space } from '@/theme';

interface WeatherData {
  tempC: number;
  windKmh: number;
  windDeg: number;
  weatherCode: number;
  isRainingNow: boolean;
  rainProbNextHours: number;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

export function windCardinal(deg: number): (typeof CARDINALS)[number] {
  const normalized = ((deg % 360) + 360) % 360;
  return CARDINALS[Math.round(normalized / 45) % 8];
}

function weatherDescription(code: number): { label: string; icon: IconName; rain: boolean } {
  if (code === 0) return { label: 'Despejado', icon: 'sunny', rain: false };
  if (code === 1 || code === 2) return { label: 'Algo nublado', icon: 'partly-sunny', rain: false };
  if (code === 3) return { label: 'Nublado', icon: 'cloud', rain: false };
  if (code === 45 || code === 48) return { label: 'Neblina', icon: 'cloud-outline', rain: false };
  if (code >= 51 && code <= 67) return { label: 'Llovizna / Lluvia', icon: 'rainy', rain: true };
  if (code >= 80 && code <= 82) return { label: 'Chaparrones', icon: 'rainy', rain: true };
  if (code >= 95) return { label: 'Tormenta', icon: 'thunderstorm', rain: true };
  return { label: 'Templado', icon: 'partly-sunny', rain: false };
}

/**
 * ROSA DE LOS VIENTOS Y CLIMA EN CANCHA
 * Ubicado a la derecha del logo con diseño holgado y claro.
 * Al tocarlo, despliega dentro de la misma tarjeta el detalle de "Clima en cancha".
 */
export function WeatherCompass({ coords }: { coords?: LatLng | null }) {
  const insets = useSafeAreaInsets();
  const lat = coords?.lat ?? -38.8857;
  const lng = coords?.lng ?? -62.0292;
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&hourly=precipitation_probability,precipitation&forecast_days=1&timezone=America%2FArgentina%2FBuenos_Aires`;
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        if (!alive || !json.current) return;

        const nowHour = new Date().getHours();
        const probs: number[] = Array.isArray(json.hourly?.precipitation_probability)
          ? json.hourly.precipitation_probability.slice(nowHour, nowHour + 4)
          : [];
        const maxProb = probs.length > 0 ? Math.max(...probs) : 0;

        setWeather({
          tempC: Math.round(Number(json.current.temperature_2m ?? 18)),
          windKmh: Math.round(Number(json.current.wind_speed_10m ?? 0)),
          windDeg: Math.round(Number(json.current.wind_direction_10m ?? 0)),
          weatherCode: Number(json.current.weather_code ?? 0),
          isRainingNow: Number(json.current.precipitation ?? 0) > 0,
          rainProbNextHours: maxProb,
        });
      } catch {
        if (alive && !weather) {
          setWeather({
            tempC: 18,
            windKmh: 14,
            windDeg: 225,
            weatherCode: 1,
            isRainingNow: false,
            rainProbNextHours: 10,
          });
        }
      }
    };
    void load();
    const timer = setInterval(load, 10 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  const data = weather ?? {
    tempC: 18,
    windKmh: 14,
    windDeg: 225,
    weatherCode: 1,
    isRainingNow: false,
    rainProbNextHours: 10,
  };

  const dir = windCardinal(data.windDeg);
  const info = weatherDescription(data.weatherCode);
  const rainAlert = data.isRainingNow || info.rain || data.rainProbNextHours >= 40;
  // El viento viene DE data.windDeg y empuja hacia (windDeg + 180)
  const blowToDeg = (data.windDeg + 180) % 360;

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Clima en cancha: ${data.tempC} grados, viento del ${dir} a ${data.windKmh} km/h`}
        onPress={() => setExpanded((v) => !v)}
        style={({ pressed }) => [
          styles.cardContainer,
          rainAlert && styles.cardRain,
          pressed && { opacity: 0.86 },
        ]}>
        {/* Rosa de los vientos completa con N, E, S, O y anillo interno */}
        <View style={styles.compass}>
          <View style={styles.compassInnerRing} />
          <View style={styles.compassCrossH} />
          <View style={styles.compassCrossV} />
          <Text style={[styles.cardinal, styles.cardN]}>N</Text>
          <Text style={[styles.cardinal, styles.cardE]}>E</Text>
          <Text style={[styles.cardinal, styles.cardS]}>S</Text>
          <Text style={[styles.cardinal, styles.cardO]}>O</Text>
          <View style={[styles.arrowWrap, { transform: [{ rotate: `${blowToDeg}deg` }] }]}>
            <Ionicons name="navigate" size={15} color={colors.moss} style={{ transform: [{ rotate: '-45deg' }] }} />
          </View>
        </View>

        {/* Cuerpo compacto con título CLIMA EN CANCHA y métricas */}
        <View style={styles.centerInfo}>
          <View style={styles.headerTagRow}>
            <Text style={styles.kickerText}>CLIMA EN CANCHA</Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={13}
              color={colors.goldDark}
            />
          </View>

          <View style={styles.topLine}>
            <Ionicons name={info.icon} size={14} color={colors.goldDark} />
            <Text style={styles.tempText}>{data.tempC}°C</Text>
            <Text style={styles.skyText} numberOfLines={1}>
              {info.label}
            </Text>
          </View>

          <View style={styles.bottomLine}>
            <View style={styles.windPill}>
              <Ionicons name="flag-outline" size={12} color={colors.muted} />
              <Text style={styles.windLabel} numberOfLines={1}>
                Viento <Text style={styles.windStrong}>{dir}</Text> · {data.windKmh} km/h
              </Text>
            </View>
            <View style={[styles.statusBadge, rainAlert ? styles.statusRain : styles.statusDry]}>
              <Ionicons
                name={rainAlert ? 'umbrella-outline' : 'sunny-outline'}
                size={11}
                color={rainAlert ? '#2B6CB0' : colors.moss}
              />
              <Text style={[styles.statusText, rainAlert ? styles.statusTextRain : styles.statusTextDry]}>
                {data.isRainingNow || info.rain
                  ? 'Lluvia'
                  : rainAlert
                    ? `Lluvia ${data.rainProbNextHours}%`
                    : 'Seco'}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>

      {/* Modal transparente: tocar en CUALQUIER lugar de la pantalla cierra el detalle */}
      <Modal
        transparent
        visible={expanded}
        animationType="fade"
        onRequestClose={() => setExpanded(false)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar detalle del clima"
          onPress={() => setExpanded(false)}
          style={styles.backdrop}>
          <View style={[styles.modalSlot, { paddingTop: insets.top + 132 }]}>
            <View style={styles.expandedOverlay}>
              <View style={styles.expandedHeader}>
                <View style={styles.expandedTitleRow}>
                  <Ionicons name="partly-sunny-outline" size={16} color={colors.goldDark} />
                  <Text style={styles.expandedTitle}>Clima en cancha</Text>
                </View>
                <Ionicons name="close" size={16} color={colors.muted} />
              </View>
              <Text style={styles.expandedLine}>
                <Text style={styles.expandedBold}>Viento:</Text> desde el {dir} ({data.windDeg}°) a {data.windKmh} km/h. La aguja indica hacia dónde empuja la pelota.
              </Text>
              <Text style={styles.expandedLine}>
                <Text style={styles.expandedBold}>Cielo:</Text> {data.tempC}°C · {info.label.toLowerCase()}.
              </Text>
              <Text style={styles.expandedLine}>
                <Text style={styles.expandedBold}>Próx. 4 hs:</Text>{' '}
                {data.isRainingNow || info.rain
                  ? 'Precipitaciones activas.'
                  : data.rainProbNextHours >= 40
                    ? `Probabilidad de lluvia ${data.rainProbNextHours}%.`
                    : `Cancha seca (${data.rainProbNextHours}% prob. lluvia).`}
              </Text>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    position: 'relative',
    zIndex: 60,
  },
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(242, 235, 219, 0.74)',
    borderWidth: 1,
    borderColor: 'rgba(160, 136, 88, 0.32)',
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  cardRain: {
    borderColor: 'rgba(43, 108, 176, 0.45)',
  },
  compass: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(160, 136, 88, 0.38)',
    backgroundColor: 'rgba(255, 253, 248, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  compassInnerRing: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(160, 136, 88, 0.18)',
  },
  compassCrossH: {
    position: 'absolute',
    width: 32,
    height: 1,
    backgroundColor: 'rgba(160, 136, 88, 0.22)',
  },
  compassCrossV: {
    position: 'absolute',
    width: 1,
    height: 32,
    backgroundColor: 'rgba(160, 136, 88, 0.22)',
  },
  cardinal: {
    position: 'absolute',
    fontSize: 8,
    fontWeight: '700',
    color: colors.muted,
    fontFamily: fonts.serif,
  },
  cardN: { top: 2, color: colors.goldDark, fontWeight: '800' },
  cardS: { bottom: 2 },
  cardE: { right: 3 },
  cardO: { left: 3 },
  arrowWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerInfo: {
    flex: 1,
    gap: 2.5,
  },
  headerTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  kickerText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.goldDark,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tempText: {
    color: colors.ink,
    fontSize: 15.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  skyText: {
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: '500',
    flexShrink: 1,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  windPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  windLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  windStrong: {
    fontWeight: '700',
    color: colors.ink,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusRain: {
    backgroundColor: 'rgba(43, 108, 176, 0.14)',
  },
  statusDry: {
    backgroundColor: 'rgba(85, 112, 58, 0.14)',
  },
  statusText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  statusTextRain: {
    color: '#2B6CB0',
  },
  statusTextDry: {
    color: colors.moss,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  modalSlot: {
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: space.md,
    alignItems: 'flex-end',
  },
  expandedOverlay: {
    width: '88%',
    maxWidth: 320,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 253, 248, 0.98)',
    borderWidth: 1,
    borderColor: colors.gold,
    gap: 5,
    ...shadow,
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  expandedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expandedTitle: {
    color: colors.ink,
    fontFamily: fonts.serif,
    fontWeight: '700',
    fontSize: 14,
  },
  expandedLine: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  expandedBold: {
    fontWeight: '700',
    color: colors.ink,
  },
});
