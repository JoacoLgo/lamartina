import { Platform, Share } from 'react-native';

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * COMPARTIR TEXTO
 * En el celular abre el menú de compartir (WhatsApp, etc.). En el navegador usa
 * el menú de compartir si existe (celulares) y, si no, copia al portapapeles.
 */
export async function shareText(message: string): Promise<ShareResult> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ text: message });
        return 'shared';
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        return 'copied';
      }
      return 'failed';
    }
    const result = await Share.share({ message });
    return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
