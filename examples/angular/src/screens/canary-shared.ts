import { createTunnel } from '@symbiote-native/angular';
import type { ISymbioteEvent } from '@symbiote-native/angular';
import { LINE_COLOR } from '../navigation-lines';

export type IChip = { id: string; index: number; color: string };
export type IMvcpItem = { id: string; label: string };

export const ACCENT = LINE_COLOR.primitives;
export const CHIP_WIDTH = 72;
export const CHIP_GAP = 12;
export const REFRESH_MS = 2_000;
export const FREEZE_MS = 3_000;
export const TRACK_OFF = '#334155';
export const INPUT_HINT = '#6b7280';
export const SITE = 'https://angular.dev';
export const LOGO_URI =
  'https://angular.io/assets/images/logos/angular/angular.png';
export const SHEET_OPTIONS = ['Share', 'Vibrate', 'Cancel'];
export const SHEET_CANCEL_INDEX = 2;

export const chips: IChip[] = Array.from({ length: 24 }, (_unused, index) => ({
  id: `chip-${index}`,
  index,
  color: `hsl(${(index * 37) % 360} 72% 56%)`,
}));

// Module level on purpose: TunnelIn and TunnelOut share only this store, not a component instance
export const overlayTunnel = createTunnel();

export function makeRows(from: number, count: number): IMvcpItem[] {
  return Array.from({ length: count }, (_value, index) => {
    const position = from + index;
    return { id: `row-${position}`, label: `item ${position}` };
  });
}

export function isChip(item: unknown): item is IChip {
  return (
    typeof item === 'object' &&
    item !== null &&
    'color' in item &&
    typeof item.color === 'string' &&
    'index' in item &&
    typeof item.index === 'number'
  );
}

export function isMvcpItem(item: unknown): item is IMvcpItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'label' in item &&
    typeof item.label === 'string'
  );
}

// nativeEvent is a plain record, so a numeric field is narrowed here instead of cast
export function nativeNumber(event: ISymbioteEvent, key: string): number {
  const value = event.nativeEvent[key];
  return typeof value === 'number' ? value : 0;
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
