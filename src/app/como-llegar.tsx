import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import type { IconName } from '@/components/icons';
import { MapRoute } from '@/components/MapRoute';
import { Screen } from '@/components/Screen';
import { DEFAULT_CONFIG } from '@/config/defaults';
import { MAP_COLORS, type MapLayer } from '@/config/map';
import { guidance, type GuidanceState } from '@/domain/geo';
import { useUserLocation } from '@/lib/location';
import { mapsDirectionsUrl, mapsSearchUrl, openUrl } from '@/lib/maps';
import { useAppStore } from '@/store/useAppStore';
import { refreshConfig } from '@/sync/engine';
import { colors, fonts, radius, space, type } from '@/theme';

const STATE_ICON: Record<GuidanceState, IconName> = {
  noGate: 'help-circle-outline',
  far: 'navigate-outline',
  nearGate: 'walk-outline',
  atGate: 'enter-outline',
  onRoute: 'checkmark-circle',
  offRoute: 'warning',
  arrived: 'flag',
};
const STATE_COLOR: Record<GuidanceState, string> = {
  noGate: colors.muted,
  far: colors.forest,
  nearGate: colors.forest,
  atGate: colors.moss,
  onRoute: colors.good,
  offRoute: colors.bad,
  arrived: colors.good,
};

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

/** Pantalla para quien viene por primera vez: mapa con el camino, GPS que lo va guiando y pasos para entrar. */
export default function HowToGetThereScreen() {
  const router = useRouter();
  const rawVenue = useAppStore((s) => s.config.venue);
  const venue = useMemo(
    () => ({
      ...rawVenue,
      gate: rawVenue.gate ?? DEFAULT_CONFIG.venue.gate,
      route: rawVenue.route.length >= 2 ? rawVenue.route : DEFAULT_CONFIG.venue.route,
      predio: rawVenue.predio.length >= 3 ? rawVenue.predio : DEFAULT_CONFIG.venue.predio,
    }),
    [rawVenue],
  );
  const isAdmin = useAppStore((s) => s.me?.role === 'admin');
  const [layer, setLayer] = useState<MapLayer>('satellite');
  const [fit, setFit] = useState(0);
  const gps = useUserLocation();

  useEffect(() => {
    void refreshConfig().catch(() => undefined);
  }, []);

  const query = venue.gate ? `${venue.gate.lat},${venue.gate.lng}` : venue.mapsQuery;
  const guide = useMemo(() => (gps.position ? guidance(gps.position, venue) : null), [gps.position, venue]);
  const hasRoute = venue.route.length >= 2;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={type.label}>{venue.sport}</Text>
        <Text style={type.title}>Cómo llegar a {venue.name}</Text>
        {venue.address ? <Text style={type.body}>{venue.address}</Text> : null}
      </View>

      <MapRoute
        venue={venue}
        position={gps.position}
        accuracyM={gps.accuracyM}
        layer={layer}
        onLayerChange={setLayer}
        fitSignal={fit}
        height={340}
      />

      <View style={styles.legend}>
        <Dot color={MAP_COLORS.gate} label={venue.gateLabel || 'Tranquera'} />
        {hasRoute ? <Dot color={MAP_COLORS.route} label="Camino" /> : null}
        {venue.predio.length >= 3 ? <Dot color={MAP_COLORS.predio} label="Predio" /> : null}
        {gps.position ? <Dot color={MAP_COLORS.me} label="Vos" /> : null}
      </View>

      {query ? (
        <View style={styles.row}>
          <Button
            label="Cómo llegar desde acá"
            icon="navigate"
            size="sm"
            style={styles.flex}
            onPress={() => openUrl(mapsDirectionsUrl(query))}
          />
          <Button
            label="Abrir Google Maps"
            variant="secondary"
            icon="map-outline"
            size="sm"
            style={styles.flex}
            onPress={() => openUrl(mapsSearchUrl(query))}
          />
        </View>
      ) : null}

      {/* GPS */}
      <Card style={guide ? { borderColor: STATE_COLOR[guide.state], borderWidth: 2 } : undefined}>
        <Text style={type.h2}>Guía con tu ubicación</Text>
        {gps.status === 'idle' || gps.status === 'asking' ? (
          <>
            <Text style={type.body}>
              Activá tu ubicación y te vamos diciendo si vas por el camino correcto hasta la tranquera y el predio. La ubicación se usa solo acá, en
              tu celular, y no se guarda.
            </Text>
            <Button
              label={gps.status === 'asking' ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}
              icon="locate"
              size="sm"
              compact
              onPress={gps.start}
              disabled={gps.status === 'asking'}
            />
          </>
        ) : null}
        {gps.status === 'denied' ? (
          <Text style={styles.warn}>No tenemos permiso para ver tu ubicación. Activalo en el navegador o en los ajustes del celular y probá de nuevo.</Text>
        ) : null}
        {gps.status === 'unavailable' ? <Text style={styles.warn}>No pudimos obtener tu ubicación. Revisá que el GPS esté prendido.</Text> : null}
        {(gps.status === 'denied' || gps.status === 'unavailable') ? <Button label="Reintentar" variant="secondary" size="sm" compact onPress={gps.start} /> : null}

        {gps.status === 'active' && guide ? (
          <>
            <View style={styles.guideRow}>
              <Ionicons name={STATE_ICON[guide.state]} size={34} color={STATE_COLOR[guide.state]} />
              <Text style={[type.body, styles.flex, styles.guideText]} accessibilityLiveRegion="polite">
                {guide.message}
              </Text>
            </View>
            {gps.accuracyM && gps.accuracyM > 100 ? (
              <Text style={type.small}>La señal de GPS es débil (±{Math.round(gps.accuracyM)} m). Si estás bajo techo o entre árboles, puede mejorar al salir.</Text>
            ) : null}
            <View style={styles.row}>
              <Button label="Centrar" variant="secondary" size="sm" icon="locate" onPress={() => setFit((n) => n + 1)} style={styles.flex} />
              <Button label="Parar" variant="ghost" size="sm" onPress={gps.stop} style={styles.flex} />
            </View>
          </>
        ) : null}
      </Card>

      {venue.arrival.length > 0 ? (
        <Card>
          <Text style={type.h2}>Cómo ingresar</Text>
          {venue.arrival.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{i + 1}</Text>
              </View>
              <Text style={[type.body, styles.flex]}>{step}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {venue.firstVisit.length > 0 ? (
        <Card>
          <Text style={type.h2}>Tu primera visita</Text>
          {venue.firstVisit.map((tip, i) => (
            <View key={i} style={styles.step}>
              <Ionicons name="checkmark-circle" size={20} color={colors.moss} />
              <Text style={[type.body, styles.flex]}>{tip}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {venue.hours || venue.phone || venue.whatsapp ? (
        <Card>
          <Text style={type.h2}>Contacto</Text>
          {venue.hours ? <Text style={type.body}>Horarios: {venue.hours}</Text> : null}
          {venue.phone ? <Button label={`Llamar ${venue.phone}`} icon="call-outline" variant="secondary" onPress={() => openUrl(`tel:${venue.phone.replace(/\s/g, '')}`)} /> : null}
          {venue.whatsapp ? <Button label="Escribir por WhatsApp" icon="logo-whatsapp" variant="secondary" onPress={() => openUrl(`https://wa.me/${venue.whatsapp}`)} /> : null}
        </Card>
      ) : null}

      {isAdmin && (!hasRoute || venue.predio.length < 3) ? (
        <Card style={styles.adminHint}>
          <Text style={type.label}>Solo administradores</Text>
          <Text style={type.body}>Falta dibujar {!hasRoute ? 'el camino' : ''}{!hasRoute && venue.predio.length < 3 ? ' y ' : ''}{venue.predio.length < 3 ? 'el contorno del predio' : ''} sobre el mapa.</Text>
          <Button label="Dibujar en el mapa" icon="create-outline" variant="secondary" onPress={() => router.push('/admin')} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: space.xs },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#fff' },
  warn: { color: colors.bad, fontWeight: '600', fontSize: 14 },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  guideText: { fontWeight: '600' },
  row: { flexDirection: 'row', gap: space.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  stepNumber: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumberText: { color: colors.cream, fontWeight: '800', fontSize: 13, fontFamily: fonts.serif },
  adminHint: { borderStyle: 'dashed', borderColor: colors.gold, borderWidth: 2, borderRadius: radius.md },
});
