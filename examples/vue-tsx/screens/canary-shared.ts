import { LINE_COLOR } from '../navigation-lines';

export const CHIP_WIDTH = 72;
export const CHIP_GAP = 12;
export const REFRESH_MS = 2_000;
export const FREEZE_MS = 3_000;
export const ACCENT = LINE_COLOR.primitives;
export const TRACK_OFF = '#334155';
export const TRACK_ON = '#369870';
export const INPUT_HINT = '#3b5266';
export const SITE = 'https://vuejs.org';
export const LOGO_URI = 'https://vuejs.org/images/logo.png';
export const SHEET_OPTIONS = ['Share', 'Vibrate', 'Cancel'];
export const SHEET_CANCEL_INDEX = 2;

export const chips = Array.from({ length: 24 }, (_, index) => ({
  id: `chip-${index}`,
  index,
  color: `hsl(${(index * 37) % 360} 70% 55%)`,
}));

export function makeRows(
  from: number,
  count: number,
): { id: string; label: string }[] {
  return Array.from({ length: count }, (_value, index) => {
    const position = from + index;
    return { id: `row-${position}`, label: `item ${position}` };
  });
}
