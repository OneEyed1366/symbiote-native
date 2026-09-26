// ScrollView's render half (framework-agnostic): picking intrinsics, reading layout dimensions,
// and the content-size dedupe are platform-invariant, so they live here; the adapter owns
// lifecycle + element assembly, calling these pure helpers from prepareScrollView.

import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type { ISymbioteIntrinsic } from '../component-names/shared';
import { readLayoutField } from './layout-event';

// Thin re-export kept for the existing public surface (adapters import this name from
// `@symbiote-native/components`); the actual field read is shared with render-scroll-sticky's
// y/height read in layout-event.ts.
export function readLayoutDimension(
  event: ISymbioteEvent,
  key: 'width' | 'height',
): number | undefined {
  return readLayoutField(event, key);
}

// 'normal'/'fast' resolve to DIFFERENT friction constants per platform (iOS 0.998/0.99, Android
// 0.985/0.9): `foldScrollViewProps` in `SymbioteFabricProps.cpp`, `#ifdef ANDROID` since both
// scroll tags resolve to `RCTScrollView` on iOS — no component name to branch on headlessly.

// The per-axis base style (`scrollViewBaseStyle`, `SymbioteFabricProps.cpp`) carries two load-
// bearing parts: `overflow: 'scroll'` — what makes an iOS Fabric node clip content at all — and
// horizontal's `flexDirection: 'row'`, which sizes the content child along the scroll axis.

// The per-axis selection: the outer scroll-view intrinsic and its content intrinsic (Android
// resolves horizontal to a dedicated ViewManager, iOS maps both back to RCTScrollView), and the
// content container's style (contentContainerStyle plus flexDirection:'row' for horizontal).
export type IScrollIntrinsics = {
  scrollViewIntrinsic: ISymbioteIntrinsic;
  contentIntrinsic: ISymbioteIntrinsic;
  contentStyle: IStyleProp<IViewStyle>;
};

export function selectScrollIntrinsics(
  isHorizontal: boolean,
  contentContainerStyle: IStyleProp<IViewStyle> | undefined,
): IScrollIntrinsics {
  // Horizontal scroll resolves to a different native component on Android (its own
  // ViewManager, not RCTScrollView+flag); on iOS both intrinsics map back to RCTScrollView.
  // The name table does the per-platform mapping; here we only pick the intrinsic.
  const scrollViewIntrinsic: ISymbioteIntrinsic = isHorizontal
    ? 'horizontal-scroll-view'
    : 'scroll-view';
  const contentIntrinsic: ISymbioteIntrinsic = isHorizontal
    ? 'horizontal-scroll-content'
    : 'scroll-content';
  const contentStyle: IStyleProp<IViewStyle> = isHorizontal
    ? [contentContainerStyle, { flexDirection: 'row' }]
    : contentContainerStyle;

  return {
    scrollViewIntrinsic,
    contentIntrinsic,
    contentStyle,
  };
}

// When sticky headers are active, the scroll offset must reach the AnimatedValue; RN raises the
// scroll event rate for it (ScrollView.js:1798): throttle 1 on the native driver, 16 on the JS
// fallback. Without sticky headers the user's throttle passes through untouched.
const STICKY_NATIVE_SCROLL_THROTTLE = 1;
const STICKY_JS_SCROLL_THROTTLE = 16;

// Which onScroll path the adapter builds: `plain` forwards the handler untouched; `sticky-native`
// lets the native driver attach the scroll value on the UI thread; `sticky-js` wraps the handler
// in an Animated.event that drives the value each JS frame.
export type IScrollForwardMode = 'plain' | 'sticky-native' | 'sticky-js';

export interface IScrollForwardingInputs {
  hasStickyHeaders: boolean;
  // hasStickyHeaders && isNativeAnimatedAvailable(), computed by the adapter, passed in so this
  // stays pure.
  nativeStickyAvailable: boolean;
  invertStickyHeaders: boolean | undefined;
  scrollEventThrottle: number | undefined;
  // Presence-checked only (unknown so every adapter's raw prop/attr shape passes with no cast).
  maintainVisibleContentPosition: unknown;
  snapToAlignment: unknown;
}

// The scroll-forwarding decisions, framework-invariant. Returns decisions, not built handlers:
// Angular caches handlers by identity to dodge a re-clone cascade, while React/Vue allocate
// fresh each render — a shared helper returning built handlers would regress Angular.
export interface IScrollForwarding {
  mode: IScrollForwardMode;
  scrollEventThrottle: number | undefined;
  capturesViewportHeight: boolean;
  collapsableChildren: boolean;
}

// maintainVisibleContentPosition/snapToAlignment anchor against mounted cells; Android Fabric
// view-flattens layout-only cells away, so RN keeps them real with collapsableChildren={false}
// (ScrollView.js:1731). No-op on iOS.

// Exported rather than inlined: the host behavior's slot fold needs the same answer from a
// place with only the owner's raw props, none of `resolveScrollForwarding`'s sticky inputs.
export function preservesContentChildren(
  maintainVisibleContentPosition: unknown,
  snapToAlignment: unknown,
): boolean {
  return (
    maintainVisibleContentPosition !== undefined ||
    snapToAlignment !== undefined
  );
}

export function resolveScrollForwarding(
  inputs: IScrollForwardingInputs,
): IScrollForwarding {
  const collapsableChildren = preservesContentChildren(
    inputs.maintainVisibleContentPosition,
    inputs.snapToAlignment,
  );
  if (!inputs.hasStickyHeaders) {
    return {
      mode: 'plain',
      scrollEventThrottle: inputs.scrollEventThrottle,
      capturesViewportHeight: false,
      collapsableChildren,
    };
  }
  const capturesViewportHeight = inputs.invertStickyHeaders === true;
  if (inputs.nativeStickyAvailable) {
    return {
      mode: 'sticky-native',
      scrollEventThrottle:
        inputs.scrollEventThrottle ?? STICKY_NATIVE_SCROLL_THROTTLE,
      capturesViewportHeight,
      collapsableChildren,
    };
  }
  return {
    mode: 'sticky-js',
    scrollEventThrottle:
      inputs.scrollEventThrottle ?? STICKY_JS_SCROLL_THROTTLE,
    capturesViewportHeight,
    collapsableChildren,
  };
}

// The last-seen content size, kept by the adapter (in a ref) to dedupe onContentSizeChange.
export type IContentSize = { width: number; height: number };

// onContentSizeChange synthesizes from the content view's onLayout, which fires on every layout
// pass — RN dedupes so the user handler only sees real size changes.
export function didContentSizeChange(
  last: IContentSize | null,
  next: IContentSize,
): boolean {
  if (last === null) return true;
  return last.width !== next.width || last.height !== next.height;
}
