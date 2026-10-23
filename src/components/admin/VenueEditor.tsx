import { Image } from 'expo-image';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { MapRoute } from '@/components/MapRoute';
import { Segmented } from '@/components/Segmented';
import type { LatLng, VenueConfig } from '@/domain/config';
import { api, errorMessage, resolveAssetUrl } from '@/lib/api';
import { useUserLocation } from '@/lib/location';
import { pickGalleryImage } from '@/lib/pickGalleryImage';
import { useAppStore } from '@/store/useAppStore';
import { colors, radius, space, type } from '@/theme';

type Editing = 'gate' | 'route' | 'predio';

/** Aviso del inicio, carrusel de fotos, redes sociales, datos de contacto y mapa del lugar. */
export function VenueEditor() {
  const token = useAppStore((s) => s.token);
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);
  const v = config.venue;
  const gps = useUserLocation();

  const [announcement, setAnnouncement] = useState(config.announcement);
  const [address, setAddress] = useState(v.address);
  const [hours, setHours] = useState(v.hours);
  const [phone, setPhone] = useState(v.phone);
  const [whatsapp, setWhatsapp] = useState(v.whatsapp);
  const [instagram, setInstagram] = useState(v.instagram);
  const [tiktok, setTiktok] = useState(v.tiktok);
  const [teamName, setTeamName] = useState(v.teamName);
  const [teamDescription, setTeamDescription] = useState(v.teamDescription);
  const [teamInstagram, setTeamInstagram] = useState(v.teamInstagram);
  const [heroEnabled, setHeroEnabled] = useState(v.heroEnabled);
  const [heroIntervalSec, setHeroIntervalSec] = useState(String(v.heroIntervalSec || 5));
  const [heroImages, setHeroImages] = useState<string[]>(v.heroImages ?? []);
  const [arrival, setArrival] = useState(v.arrival.join('\n'));
  const [firstVisit, setFirstVisit] = useState(v.firstVisit.join('\n'));
  const [gate, setGate] = useState<LatLng | null>(v.gate);
  const [route, setRoute] = useState<LatLng[]>(v.route);
  const [predio, setPredio] = useState<LatLng[]>(v.predio);
  const [editing, setEditing] = useState<Editing>('route');
  const [fit, setFit] = useState(0);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const draft: VenueConfig = { ...v, gate, route, predio };

  const addPoint = (p: LatLng) => {
    if (editing === 'gate') setGate(p);
    else if (editing === 'route') setRoute((prev) => [...prev, p]);
    else setPredio((prev) => [...prev, p]);
  };
  const undo = () => {
    if (editing === 'route') setRoute((p) => p.slice(0, -1));
    if (editing === 'predio') setPredio((p) => p.slice(0, -1));
  };
  const clear = () => {
    if (editing === 'route') setRoute([]);
    if (editing === 'predio') setPredio([]);
    if (editing === 'gate') setGate(null);
  };

  const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

  const uploadGalleryPhoto = async () => {
    setMessage(null);
    try {
      const dataUrl = await pickGalleryImage();
      if (!dataUrl) return;
      setBusy(true);
      try {
        const res = await api<typeof config>('POST', '/admin/gallery', { token, body: { image: dataUrl } });
        setConfig(res);
        setHeroImages(res.venue.heroImages ?? []);
        setMessage({ text: 'Imagen agregada al carrusel (guardada en assets/galeria).' });
      } catch {
        // Si está sin servidor, la suma como dataUrl en la configuración
        setHeroImages((prev) => [...prev, dataUrl]);
        setMessage({ text: 'Imagen sumada a la lista. Tocá "Guardar cambios" para aplicarla.' });
      }
    } catch (e) {
      setMessage({ text: errorMessage(e), bad: true });
    } finally {
      setBusy(false);
    }
  };

  const removeGalleryPhoto = async (imgUrl: string) => {
    setMessage(null);
    if (imgUrl.startsWith('/api/gallery/')) {
      const name = imgUrl.replace('/api/gallery/', '');
      setBusy(true);
      try {
        const res = await api<typeof config>('DELETE', `/admin/gallery/${name}`, { token });
        setConfig(res);
        setHeroImages(res.venue.heroImages ?? []);
        setMessage({ text: 'Imagen quitada del carrusel.' });
      } catch (e) {
        setMessage({ text: errorMessage(e), bad: true });
      } finally {
        setBusy(false);
      }
      return;
    }
    setHeroImages((prev) => prev.filter((x) => x !== imgUrl));
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const interval = Math.min(30, Math.max(2, Number(heroIntervalSec) || 5));
    const nextVenue: VenueConfig = {
      ...v,
      address,
      hours,
      phone,
      whatsapp,
      instagram,
      tiktok,
      teamName,
      teamDescription,
      teamInstagram,
      heroEnabled,
      heroIntervalSec: interval,
      heroImages,
      gate,
      route,
      predio,
      arrival: lines(arrival),
      firstVisit: lines(firstVisit),
      mapsQuery: gate ? `${gate.lat},${gate.lng}` : v.mapsQuery,
    };
    try {
      const res = await api<typeof config>('PUT', '/admin/config', {
        token,
        body: {
          announcement,
          venue: nextVenue,
        },
      });
      setConfig(res);
      setHeroImages(res.venue.heroImages ?? []);
      setMessage({ text: 'Guardado. Ya lo ven todos los jugadores.' });
    } catch (e) {
      setConfig({ ...config, announcement, venue: nextVenue });
      setMessage({ text: `${errorMessage(e)} (Se guardó en este dispositivo).`, bad: true });
    }
    setBusy(false);
  };

  return (
    <>
      <Card>
        <Text style={type.h2}>Aviso en el inicio</Text>
        <Field
          value={announcement}
          onChangeText={setAnnouncement}
          placeholder="Ej: Hoy torneo a las 16 h · Cancha cerrada por lluvia"
          autoCapitalize="sentences"
          multiline
          hint={`${announcement.length}/200 · dejalo vacío para no mostrar ningún aviso`}
          maxLength={200}
        />
      </Card>

      <Card>
        <Text style={type.h2}>Imágenes de fondo en el inicio</Text>
        <Text style={type.small}>
          Podés colocar tus fotos directamente en la carpeta <Text style={styles.code}>assets/galeria</Text> en Visual Studio Code o subirlas desde acá.
          Si no hay imágenes o elegís &quot;Fondo homogéneo&quot;, el inicio mantiene su color liso clásico.
        </Text>

        <Segmented
          options={[
            { value: 'on', label: 'Mostrar imágenes' },
            { value: 'off', label: 'Fondo homogéneo' },
          ]}
          value={heroEnabled ? 'on' : 'off'}
          onChange={(val) => setHeroEnabled(val === 'on')}
        />

        <Field
          label="Tiempo entre cada imagen (segundos)"
          value={heroIntervalSec}
          onChangeText={(t) => setHeroIntervalSec(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="5"
          hint="Recomendado: 5 segundos."
        />

        {heroImages.length > 0 ? (
          <View style={styles.galleryGrid}>
            {heroImages.map((img, i) => (
              <View key={`${img}-${i}`} style={styles.thumbCard}>
                <Image source={resolveAssetUrl(img)} style={styles.thumb} contentFit="cover" />
                <Pressable accessibilityRole="button" onPress={() => removeGalleryPhoto(img)} style={styles.thumbRemove}>
                  <Text style={styles.thumbRemoveText}>Quitar</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={type.small}>No hay imágenes cargadas (se muestra el fondo homogéneo).</Text>
        )}

        <Button label="Subir imagen al inicio" variant="secondary" icon="images-outline" compact onPress={uploadGalleryPhoto} disabled={busy} />
      </Card>

      <Card>
        <Text style={type.h2}>Reservas, contacto y redes sociales</Text>
        <Field label="Dirección" value={address} onChangeText={setAddress} autoCapitalize="sentences" />
        <Field label="Horarios" value={hours} onChangeText={setHours} placeholder="Ej: Todos los días de 9 a 19 h" autoCapitalize="sentences" />
        <Field label="Teléfono (reservas / consultas)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+54 9 2932 555555" />
        <Field
          label="WhatsApp (solo números, con código de país)"
          value={whatsapp}
          onChangeText={(t) => setWhatsapp(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="5492932555555"
        />
        <Field label="Enlace de Instagram" value={instagram} onChangeText={setInstagram} placeholder="https://www.instagram.com/lamartinafootgolf" />
        <Field label="Enlace de TikTok" value={tiktok} onChangeText={setTiktok} placeholder="https://www.tiktok.com/@lamartinafootgolf" />
      </Card>

      <Card>
        <Text style={type.h2}>Equipo local de Footgolf</Text>
        <Field label="Nombre del equipo" value={teamName} onChangeText={setTeamName} placeholder="Punteros F.C." autoCapitalize="words" />
        <Field
          label="Descripción"
          value={teamDescription}
          onChangeText={setTeamDescription}
          placeholder="El primer equipo puntaltense de Footgolf"
          autoCapitalize="sentences"
        />
        <Field label="Instagram del equipo" value={teamInstagram} onChangeText={setTeamInstagram} placeholder="https://www.instagram.com/punteros.f.c" />
      </Card>

      <Card>
        <Text style={type.h2}>Mapa: tranquera, camino y predio</Text>
        {Platform.OS !== 'web' ? (
          <Text style={type.small}>El dibujo sobre el mapa se hace desde la versión web (en la compu o en el navegador del celular).</Text>
        ) : (
          <>
            <Text style={type.small}>Elegí qué vas a marcar y tocá el mapa. El camino va en orden, desde la tranquera hasta el predio.</Text>
            <Segmented
              options={[
                { value: 'gate', label: 'Tranquera' },
                { value: 'route', label: `Camino (${route.length})` },
                { value: 'predio', label: `Predio (${predio.length})` },
              ]}
              value={editing}
              onChange={setEditing}
            />
            <MapRoute venue={draft} position={gps.position} accuracyM={gps.accuracyM} editing={editing} onPick={addPoint} fitSignal={fit} height={360} />
            <View style={styles.row}>
              <Button label="Deshacer" variant="secondary" size="sm" style={styles.flex} onPress={undo} disabled={editing === 'gate'} />
              <Button label="Borrar" variant="ghost" size="sm" style={styles.flex} onPress={clear} />
              <Button label="Encuadrar" variant="ghost" size="sm" style={styles.flex} onPress={() => setFit((n) => n + 1)} />
            </View>

            <Text style={type.label}>Marcar caminando (con el GPS)</Text>
            <Text style={type.small}>Parado en el lugar, activá tu ubicación y sumá el punto: así el camino queda exacto, tal como se camina.</Text>
            {gps.status !== 'active' ? (
              <Button
                label={gps.status === 'asking' ? 'Buscando ubicación…' : 'Activar mi ubicación'}
                variant="secondary"
                icon="locate"
                compact
                onPress={gps.start}
                disabled={gps.status === 'asking'}
              />
            ) : (
              <Button
                label={editing === 'gate' ? 'Marcar la tranquera acá' : editing === 'route' ? 'Agregar mi posición al camino' : 'Agregar mi posición al predio'}
                icon="add-circle-outline"
                compact
                onPress={() => gps.position && addPoint(gps.position)}
              />
            )}
            {gps.status === 'denied' ? <Text style={styles.error}>No hay permiso para usar la ubicación.</Text> : null}
          </>
        )}
      </Card>

      <Card>
        <Text style={type.h2}>Cómo ingresar</Text>
        <Field value={arrival} onChangeText={setArrival} multiline numberOfLines={6} autoCapitalize="sentences" hint="Un paso por línea, en orden." style={styles.multiline} />
        <Text style={type.h2}>Tu primera visita</Text>
        <Field value={firstVisit} onChangeText={setFirstVisit} multiline numberOfLines={4} autoCapitalize="sentences" hint="Un consejo por línea (qué llevar, dónde dejar el auto…)." style={styles.multiline} />
      </Card>

      {message ? <Text style={[styles.message, message.bad && { color: colors.bad }]}>{message.text}</Text> : null}
      <Button label={busy ? 'Guardando…' : 'Guardar cambios'} icon="save-outline" onPress={save} disabled={busy} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  multiline: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  error: { color: colors.bad, fontWeight: '600', fontSize: 14 },
  message: { ...type.small, textAlign: 'center', color: colors.good, fontSize: 14 },
  code: { fontWeight: '700', color: colors.forest },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  thumbCard: {
    width: 112,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cream,
  },
  thumb: {
    width: 112,
    height: 74,
  },
  thumbRemove: {
    paddingVertical: 5,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  thumbRemoveText: {
    color: colors.bad,
    fontSize: 12,
    fontWeight: '700',
  },
});
