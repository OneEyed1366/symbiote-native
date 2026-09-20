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

// THE ANDROID WRAP SPLIT LEFT THIS FILE ON 2026-09-18, and with it the last copy of RN's
// `splitLayoutProps` key partition. Both halves are `SymbioteFabricProps.cpp` now
// (`splitScrollViewStyle`, `foldRefreshWrapperProps`), reached off the tag and the tree rather than
// from a `payloadFold` per node — see `behaviors/scroll-view/index.android.ts` for what made the
// wrapper's half possible at all.
//
// Nothing replaced them here on purpose: a JS copy kept for a caller that no longer exists is the
// mirror shape this migration keeps deleting, and the twenty-eight layout keys are exactly the kind
// of list that drifts in silence. `core/engine/cpp/tests/js/scroll-view-wrap-payload.itest.ts`
// asserts the split on the payload a commit actually sent, which is the only place it can now be
// wrong.

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
// their defaults live on `ISymbioteNode` because a `<scroll-view>` hands the app its engine node
// directly, with no wrapper to build a handle: two implementations would let `scrollTo()` with no
// argument mean one thing through a ref and another through a tag, and nothing would report it.
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
