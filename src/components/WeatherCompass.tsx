import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { IconName } from '@/components/icons';
import type { LatLng } from '@/domain/config';
import { colors, fonts, radius, shadow } from '@/theme';

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
          pressed && { opacity: 0.94 },
        ]}>
        <View style={styles.mainRow}>
          {/* Rosa de los vientos más amplia y legible */}
          <View style={styles.compass}>
            <View style={styles.compassInnerRing} />
            <View style={styles.compassCrossH} />
            <View style={styles.compassCrossV} />
            <Text style={[styles.cardinal, styles.cardN]}>N</Text>
            <Text style={[styles.cardinal, styles.cardE]}>E</Text>
            <Text style={[styles.cardinal, styles.cardS]}>S</Text>
            <Text style={[styles.cardinal, styles.cardO]}>O</Text>
            <View style={[styles.arrowWrap, { transform: [{ rotate: `${blowToDeg}deg` }] }]}>
              <Ionicons name="navigate" size={22} color={colors.goldLight} style={{ transform: [{ rotate: '-45deg' }] }} />
            </View>
          </View>

          {/* Cuerpo central suelto y distribuido */}
          <View style={styles.centerInfo}>
            <View style={styles.headerTagRow}>
              <Text style={styles.kickerText}>CLIMA EN CANCHA</Text>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={15}
                color={colors.goldLight}
              />
            </View>

            <View style={styles.metricsWrap}>
              <View style={styles.tempChip}>
                <Ionicons name={info.icon} size={18} color={colors.goldLight} />
                <Text style={styles.tempText}>{data.tempC}°C</Text>
                <Text style={styles.skyText}>{info.label}</Text>
              </View>

              <View style={styles.windAndRainRow}>
                <View style={styles.windPill}>
                  <Ionicons name="flag-outline" size={14} color={colors.goldLight} />
                  <Text style={styles.windLabel}>
                    Viento <Text style={styles.windStrong}>{dir}</Text> · {data.windKmh} km/h
                  </Text>
                </View>

                <View style={[styles.statusBadge, rainAlert ? styles.statusRain : styles.statusDry]}>
                  <Ionicons
                    name={rainAlert ? 'umbrella' : 'checkmark-circle'}
                    size={13}
                    color={rainAlert ? '#FFFFFF' : colors.forestDeep}
                  />
                  <Text style={[styles.statusText, rainAlert ? styles.statusTextRain : styles.statusTextDry]}>
                    {data.isRainingNow || info.rain
                      ? 'Lluvia'
                      : rainAlert
                        ? `Lluvia ${data.rainProbNextHours}%`
                        : `Seco ${data.rainProbNextHours}%`}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Panel desplegable integrado dentro de la misma tarjeta para que encaje perfecto */}
        {expanded ? (
          <View style={styles.expandedSection}>
            <View style={styles.expandedHeader}>
              <Ionicons name="partly-sunny-outline" size={17} color={colors.goldLight} />
              <Text style={styles.expandedTitle}>Clima en cancha</Text>
            </View>
            <Text style={styles.expandedLine}>
              <Text style={styles.expandedBold}>Viento en los hoyos:</Text> sopla desde el {dir} ({data.windDeg}°) a{' '}
              {data.windKmh} km/h. La aguja de la rosa indica hacia dónde empuja la pelota.
            </Text>
            <Text style={styles.expandedLine}>
              <Text style={styles.expandedBold}>Condición actual:</Text> {data.tempC}°C con cielo {info.label.toLowerCase()}.
            </Text>
            <Text style={styles.expandedLine}>
              <Text style={styles.expandedBold}>Pronóstico próx. 4 hs:</Text>{' '}
              {data.isRainingNow || info.rain
                ? 'Precipitaciones activas sobre la cancha.'
                : data.rainProbNextHours >= 40
                  ? `Probabilidad de lluvia del ${data.rainProbNextHours}%.`
                  : `Cancha sin lluvias previstas (${data.rainProbNextHours}% prob.).`}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    zIndex: 25,
  },
  cardContainer: {
    borderRadius: radius.lg,
    backgroundColor: colors.forestDeep,
    borderWidth: 1.5,
    borderColor: colors.gold,
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
    ...shadow,
  },
  cardRain: {
    borderColor: '#63B3ED',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  compass: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: colors.gold,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  compassInnerRing: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(217, 199, 154, 0.22)',
  },
  compassCrossH: {
    position: 'absolute',
    width: 38,
    height: 1,
    backgroundColor: 'rgba(217, 199, 154, 0.28)',
  },
  compassCrossV: {
    position: 'absolute',
    width: 1,
    height: 38,
    backgroundColor: 'rgba(217, 199, 154, 0.28)',
  },
  cardinal: {
    position: 'absolute',
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.cream,
    fontFamily: fonts.serif,
  },
  cardN: { top: 2, color: colors.goldLight },
  cardS: { bottom: 2 },
  cardE: { right: 4 },
  cardO: { left: 4 },
  arrowWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerInfo: {
    flex: 1,
    gap: 5,
  },
  headerTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kickerText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: colors.goldLight,
  },
  metricsWrap: {
    gap: 5,
  },
  tempChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  tempText: {
    color: colors.cream,
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  skyText: {
    color: colors.cream,
    opacity: 0.92,
    fontSize: 13,
    fontWeight: '600',
  },
  windAndRainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  windPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  windLabel: {
    color: colors.goldLight,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  windStrong: {
    fontWeight: '800',
    color: colors.cream,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusRain: {
    backgroundColor: '#2B6CB0',
  },
  statusDry: {
    backgroundColor: colors.goldLight,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  statusTextRain: {
    color: '#FFFFFF',
  },
  statusTextDry: {
    color: colors.forestDeep,
  },
  expandedSection: {
    marginTop: 2,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(217, 199, 154, 0.3)',
    gap: 5,
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  expandedTitle: {
    color: colors.goldLight,
    fontFamily: fonts.serif,
    fontWeight: '700',
    fontSize: 15,
  },
  expandedLine: {
    color: colors.cream,
    fontSize: 12.5,
    lineHeight: 18,
  },
  expandedBold: {
    fontWeight: '700',
    color: colors.goldLight,
  },
});
