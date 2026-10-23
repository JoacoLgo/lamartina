import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { FORMATS } from '@/domain/formats';
import { space, type } from '@/theme';

/** Guía rápida para quien nunca jugó: lo básico del deporte y cómo se usa cada formato. */
export default function RulesScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={type.label}>Footgolf</Text>
        <Text style={type.title}>Cómo se juega</Text>
      </View>

      <Card>
        <Text style={type.h2}>Lo básico</Text>
        <Text style={type.body}>
          Es como el golf, pero se patea una pelota de fútbol (número 5) hasta embocarla en un hoyo en el piso.
          Gana quien lo hace con menos patadas.
        </Text>
        <Text style={type.body}>
          Cada hoyo tiene un «par»: la cantidad de patadas que necesita un jugador hábil. Si hacés menos, es un
          birdie; si hacés más, un bogey.
        </Text>
      </Card>

      <Card>
        <Text style={type.h2}>Orden de salida</Text>
        <Text style={type.body}>
          En el primer hoyo sale quien se acuerde en el grupo. En los siguientes, sale primero quien mejor jugó
          el hoyo anterior. Ya en la cancha, patea primero el que está más lejos del hoyo. La app te muestra el
          orden de salida de cada hoyo.
        </Text>
      </Card>

      <Card>
        <Text style={type.h2}>Penalizaciones</Text>
        <Text style={type.body}>
          Algunas situaciones (pelota al agua, fuera de límites, etc.) suman patadas extra. Las reglas exactas
          pueden variar según la cancha: en la app anotás cada una con el botón de penalizaciones y se suma al total.
        </Text>
      </Card>

      <Text style={type.h2}>Formatos de juego</Text>
      {FORMATS.map((f) => (
        <Card key={f.id}>
          <Text style={type.h2}>{f.name}</Text>
          <Text style={type.body}>{f.description}</Text>
        </Card>
      ))}

      <Card>
        <Text style={type.h2}>Cómo leer la tarjeta</Text>
        <Text style={type.body}>
          Un número con círculo es un hoyo mejor que el par. Con cuadrado, peor que el par. Sin marca, par justo.
          Doble círculo: águila o hoyo en uno.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
});
