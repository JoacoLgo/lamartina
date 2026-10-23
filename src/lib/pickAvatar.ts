import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Elegir una foto de perfil en el CELULAR: abre la galería, deja recortar en cuadrado y la
 * achica a 160×160 (pesa ~10 KB). Devuelve la foto lista para enviar, o null si se canceló.
 */
export async function pickAvatar(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Necesitamos permiso para acceder a tus fotos.');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled || !result.assets[0]) return null;
  const small = await ImageManipulator.manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 160, height: 160 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return small.base64 ? `data:image/jpeg;base64,${small.base64}` : null;
}
