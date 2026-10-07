import { createTunnel } from '@symbiote-native/react';

export const CHIP_WIDTH = 72;
export const CHIP_GAP = 12;
export const REFRESH_MS = 2_000;
export const FREEZE_MS = 3_000;
export const TRACK_OFF = '#334155';
export const INPUT_HINT = '#41506a';

export const chips = Array.from({ length: 24 }, (_, index) => ({
  id: `chip-${index}`,
  index,
  color: `hsl(${(index * 37) % 360} 70% 55%)`,
}));

// Module level on purpose: In and Out share only this store, not a component instance
export const overlayTunnel = createTunnel();
