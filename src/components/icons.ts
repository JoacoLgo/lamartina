import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/** Nombres válidos de íconos (librería Ionicons, incluida en Expo). Catálogo: https://icons.expo.fyi */
export type IconName = ComponentProps<typeof Ionicons>['name'];
