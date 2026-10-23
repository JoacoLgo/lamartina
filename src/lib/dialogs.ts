import { Alert, Platform } from 'react-native';

/**
 * CONFIRMACIONES QUE FUNCIONAN EN CELULAR Y EN NAVEGADOR
 * `Alert.alert` de React Native NO hace nada en la versión web: un botón
 * "Terminar ronda" que dependa de eso quedaría muerto en el navegador. Esta
 * función usa el cuadro del navegador en web y el nativo en el celular.
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = [options.title, options.message].filter(Boolean).join('\n\n');
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(text));
  }
  return new Promise((resolve) => {
    Alert.alert(
      options.title,
      options.message,
      [
        { text: options.cancelLabel ?? 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        {
          text: options.confirmLabel ?? 'Aceptar',
          style: options.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
