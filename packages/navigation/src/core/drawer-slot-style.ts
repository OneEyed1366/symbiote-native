// The animated style of one drawer slot, from the geometry and the `progress` value
// `progress` stays the adapter's own `Animated` value, only its `interpolate` is used here

import type { AnimatedValue } from '@symbiote-native/engine';
import { resolveDrawerSlotInterpolation } from './drawer-options';
import type {
  IDrawerContentSlotInterpolation,
  IDrawerGeometry,
  IDrawerOverlaySlotInterpolation,
  IDrawerPanelSlotInterpolation,
} from './drawer-options';
import type { IDrawerSlot } from './render-drawer';

type ISlotInterpolation =
  | IDrawerContentSlotInterpolation
  | IDrawerOverlaySlotInterpolation
  | IDrawerPanelSlotInterpolation;

// Overloaded per slot, so a call on a union of slots matches none: one entry per slot instead
const INTERPOLATIONS: Record<
  IDrawerSlot,
  (geometry: IDrawerGeometry) => ISlotInterpolation
> = {
  content: geometry => resolveDrawerSlotInterpolation(geometry, 'content'),
  overlay: geometry => resolveDrawerSlotInterpolation(geometry, 'overlay'),
  panel: geometry => resolveDrawerSlotInterpolation(geometry, 'panel'),
};

export function buildAnimatedSlotStyle(
  progress: Pick<AnimatedValue, 'interpolate'>,
  geometry: IDrawerGeometry,
  slot: IDrawerSlot,
): { opacity?: unknown; transform: { translateX: unknown }[] } {
  const interpolation = INTERPOLATIONS[slot](geometry);
  const transform = [
    { translateX: progress.interpolate(interpolation.translateX) },
  ];
  // Only the overlay fades, and its `translateX` follows the CONTENT's travel on purpose
  return 'opacity' in interpolation
    ? { opacity: progress.interpolate(interpolation.opacity), transform }
    : { transform };
}
