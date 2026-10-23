import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { api, avatarUrl, errorMessage } from '@/lib/api';
import { confirmAction } from '@/lib/dialogs';
import { useAppStore } from '@/store/useAppStore';
import { colors, space, type } from '@/theme';

interface AdminUser {
  id: string;
  username: string;
  name: string;
  displayName: string;
  role: 'player' | 'admin';
  avatarV: number | null;
  disabled: boolean;
}

/** Lista de jugadores: restablecer contraseña, desactivar cuentas y dar o quitar el rol de administrador. */
export function PlayersAdmin() {
  const token = useAppStore((s) => s.token);
  const meId = useAppStore((s) => s.me?.id);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ users: AdminUser[] }>('GET', `/admin/users?q=${encodeURIComponent(query.trim())}`, { token });
      setUsers(res.users);
    } catch (e) {
      setMessage({ text: errorMessage(e), bad: true });
    }
  }, [query, token]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ text: ok });
      await load();
    } catch (e) {
      setMessage({ text: errorMessage(e), bad: true });
    }
  };

  const toggleDisabled = async (u: AdminUser) => {
    if (!u.disabled) {
      const ok = await confirmAction({
        title: 'Desactivar cuenta',
        message: `${u.displayName} no va a poder entrar ni aparecer en el ranking. Se puede reactivar cuando quieras.`,
        confirmLabel: 'Desactivar',
        destructive: true,
      });
      if (!ok) return;
    }
    await run(() => api('PATCH', `/admin/users/${u.id}`, { token, body: { disabled: !u.disabled } }), u.disabled ? 'Cuenta reactivada.' : 'Cuenta desactivada.');
  };

  const toggleAdmin = async (u: AdminUser) => {
    const ok = await confirmAction({
      title: u.role === 'admin' ? 'Quitar administrador' : 'Hacer administrador',
      message: u.role === 'admin' ? `${u.displayName} deja de poder administrar la cancha.` : `${u.displayName} va a poder cambiar hoyos, jugadores y rondas.`,
      confirmLabel: 'Confirmar',
    });
    if (ok) await run(() => api('PATCH', `/admin/users/${u.id}`, { token, body: { role: u.role === 'admin' ? 'player' : 'admin' } }), 'Rol actualizado.');
  };

  const resetPassword = (u: AdminUser) =>
    run(async () => {
      await api('POST', `/admin/users/${u.id}/reset-password`, { token, body: { password: newPassword } });
      setResetFor(null);
      setNewPassword('');
    }, `Contraseña de ${u.displayName} restablecida. Se cerró su sesión en todos los celulares: avisale la nueva.`);

  return (
    <>
      <Field value={query} onChangeText={setQuery} placeholder="Buscar por nombre o usuario" />
      {message ? <Text style={[styles.message, message.bad && { color: colors.bad }]}>{message.text}</Text> : null}
      {users.length === 0 ? <Text style={type.small}>No hay jugadores que coincidan.</Text> : null}
      {users.map((u) => (
        <Card key={u.id} style={u.disabled ? styles.disabled : undefined}>
          <View style={styles.top}>
            <Avatar name={u.displayName} id={u.id} uri={avatarUrl(u.id, u.avatarV)} size={44} />
            <View style={styles.flex}>
              <Text style={styles.name}>{u.displayName}</Text>
              <Text style={type.small}>
                @{u.username}
                {u.role === 'admin' ? ' · Administrador' : ''}
                {u.disabled ? ' · Desactivado' : ''}
              </Text>
            </View>
          </View>
          {resetFor === u.id ? (
            <View style={styles.reset}>
              <Field value={newPassword} onChangeText={setNewPassword} placeholder="Contraseña nueva (mínimo 6)" secureTextEntry />
              <View style={styles.row}>
                <Button label="Guardar" icon="key-outline" style={styles.flex} disabled={newPassword.length < 6} onPress={() => resetPassword(u)} />
                <Button label="Cancelar" variant="ghost" style={styles.flex} onPress={() => (setResetFor(null), setNewPassword(''))} />
              </View>
            </View>
          ) : (
            <View style={styles.row}>
              <Button label="Contraseña" variant="secondary" style={styles.flex} onPress={() => setResetFor(u.id)} />
              {u.id !== meId ? (
                <>
                  <Button label={u.disabled ? 'Reactivar' : 'Desactivar'} variant={u.disabled ? 'secondary' : 'ghost'} style={styles.flex} onPress={() => toggleDisabled(u)} />
                  <Button label={u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'} variant="ghost" style={styles.flex} onPress={() => toggleAdmin(u)} />
                </>
              ) : null}
            </View>
          )}
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontSize: 17, fontWeight: '700', color: colors.ink },
  reset: { gap: space.sm },
  disabled: { opacity: 0.6 },
  message: { ...type.small, textAlign: 'center', color: colors.good, fontSize: 14 },
});
