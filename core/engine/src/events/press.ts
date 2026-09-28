// The synthesized tap: Fabric has no `press` event, so one is built from a touch sequence. This
// module owns the in-flight gestures and the long-press clock, nothing about delivery

import { isRecord } from '../type-guards';
import { isSymbioteNode, type ISymbioteNode } from '../node';
import { endsWithin } from './delivery';

export interface IPressGesture {
  owner: ISymbioteNode;
  longPressTimer: ReturnType<typeof setTimeout> | undefined;
  longPressFired: boolean;
  longPressStart: { x: number; y: number } | undefined;
}

// Each unrelated target owns an independent press, and further fingers under the same owner JOIN
// it, so one target still sees exactly one `pressIn` / `press` / `pressOut` lifecycle
export const activePresses = new Set<IPressGesture>();

export function clearLongPress(press: IPressGesture): void {
  if (press.longPressTimer !== undefined) {
    clearTimeout(press.longPressTimer);
    press.longPressTimer = undefined;
  }
}

export function takeAllPresses(): IPressGesture[] {
  const presses = [...activePresses];
  activePresses.clear();
  for (const press of presses) clearLongPress(press);
  return presses;
}

export function findActivePress(
  target: ISymbioteNode,
): IPressGesture | undefined {
  for (const press of activePresses) {
    if (endsWithin(target, press.owner)) return press;
  }
  return undefined;
}

// Every press whose last finger left in this frame, removed from the active set. An owner with a
// finger still down keeps its press, which is what makes a multi-touch lift not a release
export function takeEndedPresses(
  nativeEvent: Record<string, unknown>,
): IPressGesture[] {
  const ended: IPressGesture[] = [];
  for (const press of activePresses) {
    if (hasRemainingTouchWithin(press.owner, nativeEvent)) continue;
    activePresses.delete(press);
    clearLongPress(press);
    ended.push(press);
  }
  return ended;
}

function pagePointOf(
  source: Record<string, unknown> | undefined,
): { x: number; y: number } | undefined {
  if (!source) return undefined;
  const { pageX, pageY } = source;
  if (typeof pageX === 'number' && typeof pageY === 'number')
    return { x: pageX, y: pageY };
  return undefined;
}

// The changed finger's page coordinate, falling back to the active-touch list and then to
// undefined, which callers read as "skip the coordinate-dependent logic" rather than guessing
export function readTouchPoint(
  nativeEvent: Record<string, unknown>,
): { x: number; y: number } | undefined {
  const direct = pagePointOf(nativeEvent);
  if (direct) return direct;
  // `changedTouches` identifies the finger for THIS frame, so it is read before the full
  // active-touch list, whose first entry may belong to another simultaneously pressed target
  for (const key of ['changedTouches', 'touches'] as const) {
    const touches = nativeEvent[key];
    if (!Array.isArray(touches)) continue;
    for (const touch of touches) {
      if (!isRecord(touch)) continue;
      const point = pagePointOf(touch);
      if (point) return point;
    }
  }
  return undefined;
}

// Whether any touch still down started inside `owner`. RN's `noResponderTouches` walks
// `nativeEvent.touches` the same way; a headless smoke fires an empty `{}`, so no remaining touch,
// which preserves single-touch behavior
export function hasRemainingTouchWithin(
  owner: ISymbioteNode,
  nativeEvent: Record<string, unknown>,
): boolean {
  const touches = nativeEvent.touches;
  if (!Array.isArray(touches)) return false;
  for (const touch of touches) {
    if (!isRecord(touch)) continue;
    const target = touch.target;
    if (isSymbioteNode(target) && endsWithin(target, owner)) return true;
  }
  return false;
}
