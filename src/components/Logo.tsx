import { Image } from 'react-native';

const SOURCES = {
  full: require('../../assets/images/logo-escudo.png'),
  empty: require('../../assets/images/logo-escudo-vacio.png'),
  letters: require('../../assets/images/logo-letras.png'),
} as const;

/**
 * Logo de La Martina:
 * - `full`: escudo completo con letras.
 * - `empty`: escudo con la banda central verde vacía (sin las letras).
 * - `letters`: únicamente las palabras arqueadas "La Martina", línea curva y "FOOTGOLF" (fondo transparente).
 */
export function Logo({
  size = 200,
  variant = 'full',
}: {
  size?: number;
  variant?: keyof typeof SOURCES;
}) {
  return (
    <Image
      source={SOURCES[variant]}
      style={{ width: size, height: size, backgroundColor: 'transparent' }}
      resizeMode="contain"
      accessibilityLabel="Logo de La Martina Footgolf"
    />
  );
}
