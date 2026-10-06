import { createTunnel } from '@symbiote-native/vue';

export const CHIP_WIDTH = 72;
export const CHIP_GAP = 12;
export const REFRESH_MS = 2_000;
export const FREEZE_MS = 3_000;
export const TRACK_OFF = '#334155';
export const SITE = 'https://vuejs.org';
export const LOGO_URI = 'https://vuejs.org/images/logo.png';
export const SHEET_OPTIONS = ['Share', 'Vibrate', 'Cancel'];
export const SHEET_CANCEL_INDEX = 2;

export const chips = Array.from({ length: 24 }, (_unused, index) => ({
  id: `chip-${index}`,
  index,
  color: `hsl(${(index * 37) % 360} 70% 55%)`,
}));

// Module level on purpose: In and Out share only this store, not a component instance
export const overlayTunnel = createTunnel();

export function makeRows(
  from: number,
  count: number,
): { id: string; label: string }[] {
  return Array.from({ length: count }, (_value, index) => {
    const position = from + index;
    return { id: `row-${position}`, label: `item ${position}` };
  });
}

export function keyboardHeightOf(payload: unknown): number {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('endCoordinates' in payload)
  ) {
    return 0;
  }
  const frame = payload.endCoordinates;
  if (typeof frame !== 'object' || frame === null || !('height' in frame)) {
    return 0;
  }
  return typeof frame.height === 'number' ? frame.height : 0;
}
