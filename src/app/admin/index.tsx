import { Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { HolesEditor } from '@/components/admin/HolesEditor';
import { PlayersAdmin } from '@/components/admin/PlayersAdmin';
import { RoundsAdmin } from '@/components/admin/RoundsAdmin';
import { VenueEditor } from '@/components/admin/VenueEditor';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { useAppStore } from '@/store/useAppStore';
import { space, type } from '@/theme';

type Tab = 'holes' | 'venue' | 'players' | 'rounds';

/** Panel del administrador: solo lo ven las cuentas con rol "admin". El servidor vuelve a verificar el permiso en cada cambio. */
export default function AdminScreen() {
  const me = useAppStore((s) => s.me);
  const [tab, setTab] = useState<Tab>('holes');
  if (!me) return <Redirect href="/ingresar" />;
  if (me.role !== 'admin') return <Redirect href="/" />;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={type.label}>Administración</Text>
        <Text style={type.title}>Gestión de la cancha</Text>
      </View>
      <Segmented
        options={[
          { value: 'holes', label: 'Hoyos' },
          { value: 'venue', label: 'Lugar' },
          { value: 'players', label: 'Jugadores' },
          { value: 'rounds', label: 'Rondas' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'holes' ? <HolesEditor /> : null}
      {tab === 'venue' ? <VenueEditor /> : null}
      {tab === 'players' ? <PlayersAdmin /> : null}
      {tab === 'rounds' ? <RoundsAdmin /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
});
