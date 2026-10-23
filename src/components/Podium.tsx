import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { colors, fonts, radius, space, type } from '@/theme';

export interface PodiumEntry {
  id: string;
  position: number;
  /** Una o dos personas (un dúo muestra las dos fotos). */
  people: { id: string; name: string; uri: string | null }[];
  title: string;
  value: string;
  sub: string;
}

const MEDAL = [colors.medalGold, colors.medalSilver, colors.medalBronze];
const BAR = [96, 70, 54];

/** Podio de los tres primeros: 2º · 1º · 3º, con foto o iniciales. */
export function Podium({ entries }: { entries: PodiumEntry[] }) {
  const first = entries.find((e) => e.position === 1) ?? entries[0];
  const second = entries.find((e) => e.position === 2) ?? (entries.length > 1 ? entries[1] : undefined);
  const third = entries.find((e) => e.position === 3) ?? (entries.length > 2 ? entries[2] : undefined);
  const slots: [PodiumEntry | undefined, number][] = [
    [second, 1],
    [first, 0],
    [third, 2],
  ];
  return (
    <View style={styles.row}>
      {slots.map(([entry, rank]) => (
        <View key={rank} style={styles.col}>
          {entry ? (
            <>
              <View style={styles.faces}>
                {entry.people.map((p, i) => (
                  <View key={p.id} style={[i > 0 && styles.overlap, styles.ring, { borderColor: MEDAL[rank] }]}>
                    <Avatar name={p.name} id={p.id} uri={p.uri} size={rank === 0 ? 56 : 46} />
                  </View>
                ))}
              </View>
              <Text style={styles.name} numberOfLines={2}>
                {entry.title}
              </Text>
              <Text style={styles.value}>{entry.value}</Text>
              <Text style={type.small}>{entry.sub}</Text>
            </>
          ) : (
            <View style={{ height: 56 }} />
          )}
          <View style={[styles.bar, { height: BAR[rank], backgroundColor: entry ? MEDAL[rank] : colors.line }]}>
            <Text style={styles.barText}>{entry ? entry.position : ''}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  col: { flex: 1, alignItems: 'center', gap: 2 },
  faces: { flexDirection: 'row', marginBottom: 4 },
  overlap: { marginLeft: -14 },
  ring: { borderWidth: 3, borderRadius: 40, backgroundColor: colors.surface },
  name: { fontFamily: fonts.serif, fontSize: 15, fontWeight: '700', color: colors.ink, textAlign: 'center', minHeight: 36 },
  value: { fontSize: 20, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  bar: { width: '100%', borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  barText: { fontFamily: fonts.serif, fontSize: 26, fontWeight: '700', color: colors.forestDeep },
});
