import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { OptionRow } from '@/components/OptionRow';
import { RoundButton } from '@/components/RoundButton';
import { MAX_HOLES } from '@/domain/config';
import { courseParTotal } from '@/domain/stats';
import type { DuoRule } from '@/domain/types';
import { api, errorMessage } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, space, type } from '@/theme';

interface Draft {
  par: number;
  distance: string;
  tip: string;
}

/** Cantidad de hoyos, par y distancia de cada uno, nombre de la cancha y regla del dúo. */
export function HolesEditor() {
  const token = useAppStore((s) => s.token);
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);

  const [name, setName] = useState(config.course.name);
  const [duoRule, setDuoRule] = useState<DuoRule>(config.duoRule);
  const [holes, setHoles] = useState<Draft[]>(
    config.course.holes.map((h) => ({ par: h.par, distance: h.distanceM ? String(h.distanceM) : '', tip: h.tip ?? '' })),
  );
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<Draft>) => setHoles((prev) => prev.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        course: {
          name,
          holes: holes.map((h) => ({ par: h.par, distanceM: h.distance.trim() ? Number(h.distance) : undefined, tip: h.tip })),
        },
        duoRule,
      };
      const res = await api<typeof config>('PUT', '/admin/config', { token, body: payload });
      setConfig(res);
      setMessage({ text: 'Guardado. Las rondas nuevas usan estos datos; las que ya se jugaron no cambian.' });
    } catch (e) {
      setMessage({ text: errorMessage(e), bad: true });
    }
    setBusy(false);
  };

  return (
    <>
      <Card>
        <Text style={type.h2}>La cancha</Text>
        <Field label="Nombre" value={name} onChangeText={setName} autoCapitalize="words" />
        <Text style={type.small}>
          {holes.length} {holes.length === 1 ? 'hoyo' : 'hoyos'} · par total {courseParTotal(holes.map((h, i) => ({ number: i + 1, par: h.par })))}
        </Text>
      </Card>

      {holes.map((h, i) => (
        <Card key={i}>
          <View style={styles.top}>
            <Text style={styles.number}>Hoyo {i + 1}</Text>
            <View style={styles.stepper}>
              <RoundButton symbol="−" size={40} tone="outline" accessibilityLabel={`Bajar el par del hoyo ${i + 1}`} onPress={() => update(i, { par: Math.max(1, h.par - 1) })} />
              <Text style={styles.par}>Par {h.par}</Text>
              <RoundButton symbol="+" size={40} tone="outline" accessibilityLabel={`Subir el par del hoyo ${i + 1}`} onPress={() => update(i, { par: Math.min(7, h.par + 1) })} />
            </View>
          </View>
          <View style={styles.fields}>
            <View style={styles.dist}>
              <Field label="Metros" value={h.distance} onChangeText={(t) => update(i, { distance: t.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="opcional" />
            </View>
            <View style={styles.tip}>
              <Field label="Consejo «Ayudín 😉»" value={h.tip} onChangeText={(t) => update(i, { tip: t })} placeholder="opcional (se verá en una próxima versión)" autoCapitalize="sentences" />
            </View>
          </View>
        </Card>
      ))}

      <View style={styles.row}>
        <Button label="Agregar hoyo" icon="add" variant="secondary" style={styles.flex} disabled={holes.length >= MAX_HOLES} onPress={() => setHoles((p) => [...p, { par: 3, distance: '', tip: '' }])} />
        <Button label="Quitar el último" variant="ghost" style={styles.flex} disabled={holes.length <= 1} onPress={() => setHoles((p) => p.slice(0, -1))} />
      </View>

      <Card>
        <Text style={type.h2}>Cómo se puntúa un dúo</Text>
        <OptionRow title="Mejor pelota" subtitle="En cada hoyo cuenta el mejor puntaje de los dos." selected={duoRule === 'best'} onPress={() => setDuoRule('best')} />
        <OptionRow title="Suma" subtitle="En cada hoyo se suman las patadas de los dos." selected={duoRule === 'sum'} onPress={() => setDuoRule('sum')} />
      </Card>

      {message ? <Text style={[styles.message, message.bad && { color: colors.bad }]}>{message.text}</Text> : null}
      <Button label={busy ? 'Guardando…' : 'Guardar cambios'} icon="save-outline" onPress={save} disabled={busy} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  number: { fontFamily: fonts.serif, fontSize: 20, fontWeight: '700', color: colors.forest },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  par: { width: 56, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.ink },
  fields: { flexDirection: 'row', gap: space.sm },
  dist: { width: 96 },
  tip: { flex: 1 },
  message: { ...type.small, textAlign: 'center', color: colors.good, fontSize: 14 },
});
