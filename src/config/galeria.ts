import type { ImageSourcePropType } from 'react-native';

/**
 * GALERÍA LOCAL DE INICIO (CARPETA `assets/galeria`)
 *
 * Si el servidor está corriendo, cualquier imagen (.jpg, .png, .webp) que pongas
 * dentro de la carpeta `assets/galeria/` se carga SOLA automáticamente, y además
 * el administrador puede subir o quitar fotos desde la pantalla "Admin -> Lugar".
 *
 * Si usás la app sin servidor y querés empaquetar imágenes fijas desde Visual Studio Code,
 * también podés agregarlas acá con `require('../../assets/galeria/tu-foto.jpg')`.
 */
export const LOCAL_GALLERY_IMAGES: (string | ImageSourcePropType)[] = [
  // Ejemplo:
  // require('../../assets/galeria/foto1.jpg'),
];
