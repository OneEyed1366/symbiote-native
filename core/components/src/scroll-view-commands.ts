// ScrollView: the imperative + style-routing module (framework-agnostic, no 3-layer split:
// ScrollView has no state machine). The imperative handle, the layout/visual style split for
// the Android RefreshControl wrap, the scroll-event guard/forwarder, and the native sticky
// scroll-attach are all platform- and framework-invariant, so they live here. The adapter
// supplies the lifecycle (the node getter, the effect) and re-exports these.

import {
  attachNativeEvent,
  dlog,
  flattenStyle,
  isSymbioteEvent,
  type AnimatedValue,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';

type IScrollHandler = (event: ISymbioteEvent) => void;

// The imperative API RN exposes on a ScrollView ref. Each method drives a native
// view command on the scroll-view node (RN ScrollViewCommands): scrollTo carries
// [x, y, animated], scrollToEnd [animated], flashScrollIndicators no args. The
// platform files wrap the component in forwardRef and back this with the scroll node.
export interface IScrollViewHandle {
  scrollTo(options?: { x?: number; y?: number; animated?: boolean }): void;
  scrollToEnd(options?: { animated?: boolean }): void;
  flashScrollIndicators(): void;
  // The raw scroll SymbioteNode behind this handle (RN's getScrollableNode). The
  // imperative handle is what a ref captures, so Animated needs this seam to reach the
  // node that fires native scroll events; see createAnimatedComponent's event attach.
  getScrollNode(): ISymbioteNode | null;
}

// RN's splitLayoutProps key partition (StyleSheet/splitLayoutProps.js): the LAYOUT keys
// that belong on the OUTER box when a layout-affecting wrapper sits between the laid-out
// frame and the visual content. Everything NOT in this set (background*, padding*, border*,
// opacity, overflow, …) is VISUAL and stays on the inner view. Replicated exactly from RN's
// switch cases so the Android RefreshControl wrap routes style the way RN does.
const LAYOUT_KEYS: ReadonlySet<string> = new Set([
  'margin',
  'marginHorizontal',
  'marginVertical',
  'marginBottom',
  'marginTop',
  'marginLeft',
  'marginRight',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'height',
  'minHeight',
  'maxHeight',
  'width',
  'minWidth',
  'maxWidth',
  'position',
  'left',
  'right',
  'bottom',
  'top',
  'transform',
  'transformOrigin',
  'rowGap',
  'columnGap',
  'gap',
]);

// Split a flattened style into the LAYOUT props that drive the outer wrapper's frame and the
// VISUAL props that paint the inner content, RN's splitLayoutProps. The Android build uses
// this when a RefreshControl wraps the scroll view: layout (margin/flex/size/position/…) goes
// on the AndroidSwipeRefreshLayout wrapper, visual (background/padding/border/…) stays on the
// inner scroll view, instead of dumping the whole style on the wrapper and hardcoding flex:1.
export function splitLayoutProps(style: IStyleProp<IViewStyle> | undefined): {
  outer: Record<string, unknown>;
  inner: Record<string, unknown>;
} {
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  // Reads keys off the style, so flatten the StyleProp (array/nested) to one object first.
  const flat = flattenStyle(style);
  for (const key of Object.keys(flat)) {
    const value = Reflect.get(flat, key);
    if (LAYOUT_KEYS.has(key)) outer[key] = value;
    else inner[key] = value;
  }
  return { outer, inner };
}

// The whole Android wrap style decision: the layout/visual split, AND the axis base composed onto
// BOTH boxes. RN does the second half too (`StyleSheet.compose(baseStyle, outer)` beside
// `compose(baseStyle, inner)`, ScrollView.js:1856), and every adapter had dropped it from the
// wrapper — so an AndroidSwipeRefreshLayout with no explicit user layout style lost `flexGrow: 1`
// and collapsed to its content height inside a flex parent, where RN's grows.
//
// One function rather than five call sites composing `[base, outer]` by hand, because that is what
// the last one drifted into: a fold written inline is invisible to
// `tests/lowered-primitive-fold-parity.test.ts`, whose oracle is shared value imports.
// `style` is `unknown` rather than `IStyleProp`, because a `payloadFold` reads it off an untyped
// props bag and `flattenStyle` — the only thing that touches it here — already takes `unknown`.
// Narrowing it would buy a guard at every fold call site and no safety.
export function splitScrollViewStyle(
  base: IStyleProp<IViewStyle> | undefined,
  style: unknown,
): { outer: IStyleProp<IViewStyle>; inner: IStyleProp<IViewStyle> } {
  const { outer, inner } = splitLayoutProps(flattenStyle(style));
  // Base UNDER the split half on both, so an explicit user value still wins — the same order the
  // unwrapped scroll view composes.
  return { outer: [base, outer], inner: [base, inner] };
}

// Re-exported so the package barrel (index.ts) can still export this guard to
// '@symbiote-native/components' callers, now that it lives in the engine, next to ISymbioteEvent.
export { isSymbioteEvent };

// Forward a wrapped scroll event to the user's ScrollHandler. The Animated.event listener
// hands raw args; the first is the original SymbioteEvent, which we narrow with a runtime
// guard (no cast) and pass through unchanged so the user sees the same event RN would deliver.
export function forwardScrollEvent(
  handler: IScrollHandler,
  args: readonly unknown[],
): void {
  const first = args[0];
  if (isSymbioteEvent(first)) handler(first);
}

// The imperative handle is identical across platforms — only the surrounding element assembly
// diverges (iOS sibling RefreshControl vs Android wrap) — so it is built once here and both
// platform files back it with their scroll node getter.
//
// It DELEGATES to the node's own methods rather than dispatching commands itself. The commands and
// their defaults live on `ISymbioteNode` because a LOWERED ScrollView hands the app its engine
// node directly, with no wrapper to build a handle: two implementations would let `scrollTo()` with
// no argument mean one thing through a ref and another through a tag, and nothing would report it.
//
// `getNode` is a LAZY getter (React `() => ref.current`, Vue `() => nodeRef.value`), read on
// every call, NOT the node captured once. The node is null at mount and only set after the
// element commits, so an eager capture would freeze `null` and every command would no-op.
export function buildScrollViewHandle(
  getNode: () => ISymbioteNode | null,
): IScrollViewHandle {
  return {
    scrollTo: (options): void => getNode()?.scrollTo(options),
    scrollToEnd: (options): void => getNode()?.scrollToEnd(options),
    flashScrollIndicators: (): void => getNode()?.flashScrollIndicators(),
    getScrollNode: (): ISymbioteNode | null => getNode(),
  };
}

// Attach the scroll event to the scroll-offset value on the NATIVE driver, RN's
// _updateAnimatedNodeAttachment / AnimatedImplementation.attachNativeEvent (ScrollView.js:1087).
// The value then tracks scroll on the UI thread and the sticky-header interpolations ride it
// natively (no JS jitter). Returns the detach function the adapter's effect calls on cleanup.
export function attachStickyScroll(
  node: ISymbioteNode,
  value: AnimatedValue,
): () => void {
  const attachment = attachNativeEvent(node, 'onScroll', [
    { nativeEvent: { contentOffset: { y: value } } },
  ]);
  dlog(
    `STICKY[attach] attachStickyScroll onScroll -> value#${value.__getNativeTag?.() ?? 'js'}`,
  );
  return () => {
    dlog('STICKY[attach] attachStickyScroll detached');
    attachment.detach();
  };
}
