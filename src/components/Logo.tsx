import { Image } from 'react-native';

/** Logo de La Martina recortado por sus bordes exactos (sin fondo ni marco cuadrado). */
export function Logo({ size = 200 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/images/logo-escudo.png')}
      style={{ width: size, height: size, backgroundColor: 'transparent' }}
      resizeMode="contain"
      accessibilityLabel="Logo de La Martina Footgolf"
    />
  );
}
