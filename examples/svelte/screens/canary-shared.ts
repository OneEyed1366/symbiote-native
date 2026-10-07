import { LINE_COLOR, NAV_LINE } from '../navigation-lines';

export const REFRESH_MS = 2_000;
export const STATUS_BAR_RED = '#ff0000';
export const STATUS_BAR_DEFAULT = '#1a1a1a';
export const PLACEHOLDER_COLOR = '#6a6a6a';
export const SURFACE = '#262626';
export const SURFACE_PRESSED = '#0f0f0f';
export const HAIRLINE = '#3a3a3a';
export const CHALK = '#cbd5e1';
export const SITE = 'https://svelte.dev';
export const LOGO_URI = 'https://svelte.dev/favicon.png';
export const SHEET_OPTIONS = ['Share', 'Vibrate', 'Cancel'];
export const SHEET_CANCEL_INDEX = 2;

// Svelte's brand flame, read from the one place it is defined
export const ACCENT = LINE_COLOR[NAV_LINE.Primitives];

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
