import { Platform, type TextStyle } from 'react-native';

/**
 * TEMA VISUAL — colores tomados del logo de La Martina
 * Todos los colores y medidas salen de acá: si querés ajustar la identidad
 * de la app, tocás este archivo y se actualiza en todas las pantallas.
 *
 *  - forest: el verde profundo de la banda "La Martina" (barras, botón principal).
 *  - cream:  el crema del cielo y de las letras del logo (fondos).
 *  - gold:   el dorado del marco y de "FOOTGOLF" (detalles, medallas, selección).
 *  - moss:   el verde oliva de las colinas (acentos suaves).
 *
 * Pensado para jugar al aire libre: fondo claro, texto oscuro y botones grandes
 * (mínimo 48 px) para usar con una mano, caminando y con sol.
 */
export const colors = {
  forest: '#0F2B1C',
  forestDeep: '#0A2014', // el verde exacto de la banda del logo
  moss: '#55703A',
  gold: '#A08858',
  goldDark: '#7A6538', //   dorado oscuro: el que se usa para TEXTO sobre crema (contraste)
  goldLight: '#D9C79A',
  cream: '#F2EBDB',
  creamLight: '#F8F4EA', // fondo general de las pantallas
  surface: '#FFFDF8', //    tarjetas
  ink: '#14231A',
  muted: '#5E6B5F',
  line: '#DDD3BD',
  good: '#2F6B3F', //       mejor que el par
  bad: '#A5412F', //        peor que el par
  medalGold: '#C9A24B',
  medalSilver: '#A8AFA9',
  medalBronze: '#B07A4A',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

/** Mínimo recomendado para elementos tocables (Apple HIG 44 pt, Material 48 dp). */
export const TOUCH = 48;

/** Serif para títulos (como "La Martina" del logo). Son fuentes que ya trae cada sistema. */
export const fonts = {
  serif: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    default: 'Georgia, "Times New Roman", Times, serif',
  }) as string,
};

export const type = {
  title: { fontFamily: fonts.serif, fontSize: 30, fontWeight: '700', color: colors.ink } satisfies TextStyle,
  h2: { fontFamily: fonts.serif, fontSize: 21, fontWeight: '700', color: colors.ink } satisfies TextStyle,
  body: { fontSize: 16, lineHeight: 23, color: colors.ink } satisfies TextStyle,
  small: { fontSize: 13, lineHeight: 18, color: colors.muted } satisfies TextStyle,
  /** Etiqueta en mayúsculas espaciadas, como "FOOTGOLF" en el logo. */
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: colors.goldDark,
  } satisfies TextStyle,
  /** Números de puntaje: ancho fijo para que las columnas no "bailen". */
  score: {
    fontSize: 46,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
} as const;

/** Sombra suave para tarjetas (en Android se usa `elevation`). */
export const shadow = {
  shadowColor: '#0A2014',
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
} as const;
