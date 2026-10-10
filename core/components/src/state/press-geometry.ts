// Pure press geometry for the hit rect `Pressability` judges a touch against, no timers or state
import type { ISymbioteEvent } from '@symbiote-native/engine';

// Slop kept around an active press before a drift fires `onPressOut`, deeper at the bottom
export const DEFAULT_PRESS_RECT_OFFSETS = {
  top: 20,
  left: 20,
  bottom: 30,
  right: 20,
};

// Per-edge inset rect, the shape every edge test reads (RN's `Rect`)
export type IEdgeInsets = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};

// Measured on-screen frame in page coordinates, `Pressability._responderRegion`
export type IResponderRegion = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};

// A scalar expands to all four edges, the object form sets them per edge (`hitSlop`, `pressRect`)
export type IRectOffset =
  number | { top?: number; left?: number; bottom?: number; right?: number };

// Narrows the per-edge object form without a cast
function isEdgeInsets(
  value: IRectOffset,
): value is { top?: number; left?: number; bottom?: number; right?: number } {
  return typeof value === 'object';
}

// Mirrors `normalizeRect` from RN's `StyleSheet/Rect.js`, absent edges read 0
export function normalizeRect(offset: IRectOffset | undefined): IEdgeInsets {
  if (offset === undefined) return { top: 0, left: 0, bottom: 0, right: 0 };
  if (isEdgeInsets(offset)) {
    const { top = 0, left = 0, bottom = 0, right = 0 } = offset;
    return { top, left, bottom, right };
  }
  return { top: offset, left: offset, bottom: offset, right: offset };
}

// Widest edge, the radius bound when no measured rect exists (headless)
export function maxEdge(insets: IEdgeInsets): number {
  return Math.max(insets.top, insets.left, insets.bottom, insets.right);
}

// Port of `Pressability._isTouchWithinResponderRegion`, strict inequalities
export function isTouchWithinRegion(
  point: { x: number; y: number },
  region: IResponderRegion,
  hitSlop: IEdgeInsets,
  pressRectOffset: IEdgeInsets,
): boolean {
  const left = region.left - hitSlop.left - pressRectOffset.left;
  const right = region.right + hitSlop.right + pressRectOffset.right;
  const top = region.top - hitSlop.top - pressRectOffset.top;
  const bottom = region.bottom + hitSlop.bottom + pressRectOffset.bottom;
  return point.x > left && point.x < right && point.y > top && point.y < bottom;
}

function pageOf(touch: unknown): { x: number; y: number } | undefined {
  if (typeof touch !== 'object' || touch === null) return undefined;
  const pageX: unknown = Reflect.get(touch, 'pageX');
  const pageY: unknown = Reflect.get(touch, 'pageY');
  if (typeof pageX === 'number' && typeof pageY === 'number')
    return { x: pageX, y: pageY };
  return undefined;
}

function firstOf(list: unknown): unknown {
  return Array.isArray(list) ? list[0] : undefined;
}

// RN's `getTouchFromPressEvent`: first active touch, then first changed, then the event itself
export function readPoint(
  event: ISymbioteEvent,
): { x: number; y: number } | undefined {
  const { nativeEvent } = event;
  const touch =
    firstOf(nativeEvent.touches) ?? firstOf(nativeEvent.changedTouches);
  return pageOf(touch ?? nativeEvent);
}

// An all-zero frame means the view is not laid out yet, RN's `_measureCallback` ignores it
export function computeRegion(
  width: number,
  height: number,
  pageX: number,
  pageY: number,
): IResponderRegion | undefined {
  if (!width && !height && !pageX && !pageY) return undefined;
  return {
    left: pageX,
    top: pageY,
    right: pageX + width,
    bottom: pageY + height,
  };
}
