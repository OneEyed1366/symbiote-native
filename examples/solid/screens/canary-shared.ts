export type IChip = { id: string; index: number; color: string };
export type IMvcpRow = { id: string; label: string };

export const CHIP_WIDTH = 72;
export const CHIP_GAP = 12;
export const REFRESH_MS = 2_000;
export const FREEZE_MS = 3_000;
export const TRACK_OFF = '#334155';
export const INPUT_HINT = '#7f8db3';
export const SITE = 'https://www.solidjs.com';
export const LOGO_URI =
  'https://www.solidjs.com/img/logo/without-wordmark/logo.png';

export const CHIPS: ReadonlyArray<IChip> = Array.from(
  { length: 24 },
  (_value, index) => ({
    id: `chip-${index}`,
    index,
    color: `hsl(${(index * 37) % 360} 70% 55%)`,
  }),
);

export function makeRows(from: number, count: number): ReadonlyArray<IMvcpRow> {
  return Array.from({ length: count }, (_value, index) => {
    const position = from + index;
    return { id: `row-${position}`, label: `item ${position}` };
  });
}
