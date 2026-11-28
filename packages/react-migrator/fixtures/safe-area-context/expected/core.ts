// Shared half of the `react-native-safe-area-context` hooks: types, context names, inset selection
// Each adapter reads the contexts through its own `createContextBridge` and calls these
export type IEdgeInsets = { top: number; right: number; bottom: number; left: number };
export type IRect = { x: number; y: number; width: number; height: number };
export type ICornerAdaptation = 'vertical' | 'horizontal';
export type ICornerAdaptedInsets = Record<ICornerAdaptation, IEdgeInsets>;
export type IUseSafeAreaInsetsOptions = { cornerAdaptation?: ICornerAdaptation };

export const SAFE_AREA_CONTEXT_NAME = {
  insets: 'SafeAreaInsetsContext',
  frame: 'SafeAreaFrameContext',
  cornerInsets: 'SafeAreaCornerAdaptedInsetsContext',
} as const;

export const NO_INSETS_ERROR =
  'No safe area value available. Make sure you are rendering `<SafeAreaProvider>` at the top of your app.';

// Upstream reads the corner context only with `cornerAdaptation`, reading both gives the same value
export function selectSafeAreaInsets(
  regular: IEdgeInsets | null | undefined,
  corner: ICornerAdaptedInsets | null | undefined,
  adaptation: ICornerAdaptation | undefined,
): IEdgeInsets {
  const insets = adaptation ? (corner?.[adaptation] ?? regular) : regular;
  if (insets == null) throw new Error(NO_INSETS_ERROR);
  return insets;
}

// A reactive adapter reads its box once in setup, so a missing Provider throws there, as React does
export function requireProvider<TBox>(box: TBox | undefined): TBox {
  if (box === undefined) throw new Error(NO_INSETS_ERROR);
  return box;
}

// The Provider keeps the current object when nothing changed, so readers do not repaint
export function pickInsets(current: IEdgeInsets | null, next: IEdgeInsets): IEdgeInsets {
  const isSame =
    current !== null &&
    next.top === current.top &&
    next.right === current.right &&
    next.bottom === current.bottom &&
    next.left === current.left;
  return isSame ? current : next;
}

// Old native code sends no frame, which keeps the current one
export function pickFrame(current: IRect, next: IRect | undefined): IRect {
  const isSame =
    next === undefined ||
    (next.x === current.x &&
      next.y === current.y &&
      next.width === current.width &&
      next.height === current.height);
  return isSame ? current : next;
}

export function requireSafeAreaFrame(frame: IRect | null | undefined): IRect {
  if (frame == null) throw new Error(NO_INSETS_ERROR);
  return frame;
}
