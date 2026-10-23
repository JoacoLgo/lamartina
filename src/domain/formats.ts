import type { PlayFormat } from './types';

export interface FormatInfo {
  id: PlayFormat;
  name: string;
  description: string;
  /** Los formatos de match play son 1 contra 1. */
  needsTwoPlayers: boolean;
}

export const FORMATS: FormatInfo[] = [
  {
    id: 'stroke',
    name: 'Stroke play (medal)',
    description: 'Gana quien hace menos patadas en total.',
    needsTwoPlayers: false,
  },
  {
    id: 'stableford',
    name: 'Stableford',
    description: 'Se suman puntos por hoyo: par 2, birdie 3, bogey 1. Gana quien más puntos junta.',
    needsTwoPlayers: false,
  },
  {
    id: 'match-golf',
    name: 'Match play (estilo golf)',
    description: '1 contra 1. Gana cada hoyo quien use menos patadas; el partido se define por hoyos arriba.',
    needsTwoPlayers: true,
  },
  {
    id: 'match-football',
    name: 'Match play (estilo fútbol)',
    description: '1 contra 1. Cada hoyo ganado es un gol y el resultado es el marcador.',
    needsTwoPlayers: true,
  },
];

export function formatInfo(id: PlayFormat): FormatInfo {
  return FORMATS.find((f) => f.id === id) ?? FORMATS[0];
}

export function isFormatAvailable(id: PlayFormat, playerCount: number): boolean {
  return !formatInfo(id).needsTwoPlayers || playerCount === 2;
}
