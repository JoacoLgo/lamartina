import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Elegir una imagen para el carrusel de inicio en el CELULAR:
 * la redimensiona a un ancho cómodo (960 px) para que cargue rápido y pese poco.
 */
export async function pickGalleryImage(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Necesitamos permiso para acceder a tus fotos.');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [16, 10],
    quality: 0.78,
  });
  if (result.canceled || !result.assets[0]) return null;
  const small = await ImageManipulator.manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 960 } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return small.base64 ? `data:image/jpeg;base64,${small.base64}` : null;
}
