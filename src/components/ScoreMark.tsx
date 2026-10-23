import { StyleSheet, Text, View } from 'react-native';

import { scoreShape } from '@/domain/scoring';
import { colors } from '@/theme';

interface Props {
  total: number;
  par: number;
  size?: number;
}

/**
 * Número de puntaje con la notación clásica de las tarjetas de golf:
 *  círculo = mejor que el par · doble círculo = águila o mejor / hoyo en uno
 *  cuadrado = peor que el par · doble cuadrado = doble bogey o peor
 * Así se lee de un vistazo cómo fue la ronda sin comparar números.
 */
export function ScoreMark({ total, par, size = 36 }: Props) {
  const shape = scoreShape(total, par);
  const diff = total - par;
  const color = diff < 0 ? colors.good : diff > 0 ? colors.bad : colors.ink;
  const isCircle = shape.includes('circle');
  const isDouble = shape.startsWith('double');
  const outerRadius = isCircle ? size / 2 : 4;
  const innerSize = size - 8;
  const number = (
    <Text style={[styles.number, { color, fontSize: Math.round(size * 0.44) }]}>{total}</Text>
  );

  if (shape === 'none') {
    return <View style={[styles.box, { width: size, height: size }]}>{number}</View>;
  }

  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderWidth: 2, borderColor: color, borderRadius: outerRadius },
      ]}>
      {isDouble ? (
        <View
          style={[
            styles.box,
            {
              width: innerSize,
              height: innerSize,
              borderWidth: 2,
              borderColor: color,
              borderRadius: isCircle ? innerSize / 2 : 2,
            },
          ]}>
          {number}
        </View>
      ) : (
        number
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  number: { fontWeight: '700', fontVariant: ['tabular-nums'] },
});
