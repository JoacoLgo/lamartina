import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { formatInfo } from '@/domain/formats';
import type { PlayFormat } from '@/domain/types';
import { api, errorMessage } from '@/lib/api';
import { confirmAction } from '@/lib/dialogs';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, space, type } from '@/theme';

interface AdminRound {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  mode: 'individual' | 'duo';
  format: PlayFormat;
  excluded: boolean;
  players: { name: string; registered: boolean; accepted: boolean }[];
  createdBy: string | null;
}

/** Rondas recientes: cerrar las que quedaron trabadas, sacar una del ranking (por ejemplo si hay dudas) o borrarla. */
export function RoundsAdmin() {
  const token = useAppStore((s) => s.token);
  const [rounds, setRounds] = useState<AdminRound[]>([]);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ rounds: AdminRound[] }>('GET', '/admin/rounds', { token });
      setRounds(res.rounds);
    } catch (e) {
      setMessage({ text: errorMessage(e), bad: true });
    }
  }, [token]);
  useEffect(() => void load(), [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ text: ok });
      await load();
    } catch (e) {
      setMessage({ text: errorMessage(e), bad: true });
    }
  };

  const remove = async (r: AdminRound) => {
    const ok = await confirmAction({ title: 'Borrar ronda', message: 'Se borra para todos. No se puede deshacer.', confirmLabel: 'Borrar', destructive: true });
    if (ok) await run(() => api('DELETE', `/rounds/${r.id}`, { token }), 'Ronda borrada.');
  };

  return (
    <>
      {message ? <Text style={[styles.message, message.bad && { color: colors.bad }]}>{message.text}</Text> : null}
      {rounds.length === 0 ? <Text style={type.small}>Todavía no hay rondas.</Text> : null}
      {rounds.map((r) => (
        <Card key={r.id}>
          <View style={styles.top}>
            <Text style={styles.date}>{new Date(r.startedAt).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={[styles.status, !r.finishedAt && { color: colors.moss }]}>{r.finishedAt ? 'Terminada' : 'En juego'}</Text>
          </View>
          <Text style={type.body}>{r.players.map((p) => p.name + (p.registered ? (p.accepted ? '' : ' (sin confirmar)') : ' (inv.)')).join(', ')}</Text>
          <Text style={type.small}>
            {r.mode === 'duo' ? 'Dúo' : formatInfo(r.format).name}
            {r.createdBy ? ` · armó ${r.createdBy}` : ''}
            {r.excluded ? ' · FUERA DEL RANKING' : ''}
          </Text>
          <View style={styles.row}>
            {!r.finishedAt ? <Button label="Cerrar" variant="secondary" style={styles.flex} onPress={() => run(() => api('PATCH', `/admin/rounds/${r.id}`, { token, body: { finish: true } }), 'Ronda cerrada.')} /> : null}
            <Button
              label={r.excluded ? 'Incluir' : 'Excluir'}
              variant="secondary"
              style={styles.flex}
              onPress={() => run(() => api('PATCH', `/admin/rounds/${r.id}`, { token, body: { excluded: !r.excluded } }), r.excluded ? 'Vuelve a contar para el ranking.' : 'Ya no cuenta para el ranking.')}
            />
            <Button label="Borrar" variant="ghost" style={styles.flex} onPress={() => remove(r)} />
          </View>
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  date: { fontFamily: fonts.serif, fontSize: 18, fontWeight: '700', color: colors.ink },
  status: { fontSize: 13, fontWeight: '700', color: colors.muted },
  message: { ...type.small, textAlign: 'center', color: colors.good, fontSize: 14 },
});
