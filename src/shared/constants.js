'use strict';

const PLAYER_COLORS = [
  '#2DFE54', // Cannabis Electric Green
  '#FF007F', // Acid Magenta
  '#00F5FF', // Electric Cyan
  '#FFB703', // Solar Dab Amber
  '#B537F2', // Ultraviolet Violet
  '#FF3333', // Toxic Flame Red
  '#FFE600', // Electric Lemon Haze
  '#00FFA3', // Mint Trichome Teal
];
const PLAYER_COLOR_NAMES = [
  'Cannabis Green',
  'Acid Magenta',
  'Electric Cyan',
  'Solar Amber',
  'Ultraviolet Violet',
  'Toxic Flame Red',
  'Electric Lemon',
  'Mint Trichome Teal',
];
const DEFAULT_ROWS = 9;
const DEFAULT_COLS = 6;
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const MAX_CASCADE_WAVES = 2000;

module.exports = {
  PLAYER_COLORS,
  PLAYER_COLOR_NAMES,
  DEFAULT_ROWS,
  DEFAULT_COLS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MAX_CASCADE_WAVES,
};
