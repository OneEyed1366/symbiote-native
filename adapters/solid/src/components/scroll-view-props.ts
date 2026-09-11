// `<scroll-view>` / `<horizontal-scroll-view>`'s prop surface, for Solid. No component left to
// type — the tag IS the element, and the engine owns everything the wrapper used to assemble:
// `buildStructure` builds the content node, `slotProps` carries `contentContainerStyle` onto it,
// `claimedChildren` places a `<refresh-control>` child (a sibling on iOS, an inverting wrap on
// Android), and the sticky seam lives in `core/components/src/behaviors/scroll-view/`.
// `../register` names it.
//
// `stickyHeaderIndices` works on a bare tag — the behavior walks the COMMITTED children rather
// than pulling "child at index N" out of a render function, so it needs no wrapper at all. The
// `sticky-header` TAG is the other spelling, better for markup you control directly since it pins
// by document order and no index has to stay in step with the children.
//
// TWO PROPS ARE NOT WHAT THEY LOOK LIKE:
//
//   horizontal            DELETED from the payload and rewritten from the TAG (`ownerFold`,
//                         behaviors/scroll-view/shared.ts). Horizontal scroll is a separate native
//                         ViewManager on Android, so the axis is the tag; a prop contradicting it
//                         is dropped with a dlog. Typed here for parity and for a ported app.
//   nestedScrollEnabled   defaults to `true` in the behavior, on both platforms, which every
//                         wrapper used to write by hand.
//
// NO `refreshControl` PROP, deliberately — write a `<refresh-control>` CHILD instead; the
// behavior claims it and places it per platform. Nothing reads a prop by that name, so typing one
// would compile and paint nothing; leaving it out fails loudly at `tsc` with this comment beside
// it, same as React's and Vue's barrels.
//
// `children` is a Solid `JSX.Element`, so this type is per-adapter by construction
// (<prop_types_split_agnostic_vs_per_adapter>).

import type { Ref } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IHostInstance } from '../host-instance';

export type { IScrollViewHandle } from '@symbiote-native/components';

type IScrollHandler = (event: ISymbioteEvent) => void;

export interface IScrollViewProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  class?: IClassNameValue;
  // A bare string resolves through the shared style registry, like `class` — not the full
  // IClassNameValue union, since IStyleProp is itself an object/array and that would be
  // ambiguous with a real style (mirrors React's/Vue's contentContainerStyle typing).
  contentContainerStyle?: IStyleProp<IViewStyle> | string;
  // See the header: the AXIS comes from the tag. Kept typed for RN parity.
  horizontal?: boolean;
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  pagingEnabled?: boolean;
  bounces?: boolean;
  decelerationRate?: 'normal' | 'fast' | number;
  scrollEventThrottle?: number;
  contentInset?: {
    top?: number;
    left?: number;
    bottom?: number;
    right?: number;
  };
  contentOffset?: { x: number; y: number };
  removeClippedSubviews?: boolean;
  // Fired when the content container's size changes. RN synthesizes this in JS by putting an
  // onLayout on the inner content view; the native scroll view has no such event of its own.
  onContentSizeChange?: (width: number, height: number) => void;
  snapToInterval?: number;
  snapToOffsets?: number[];
  snapToAlignment?: 'start' | 'center' | 'end';
  snapToStart?: boolean;
  snapToEnd?: boolean;
  disableIntervalMomentum?: boolean;
  // Honored by the behavior, which walks the COMMITTED children — no wrapper needed to pull "the
  // child at index N" out of anything.
  stickyHeaderIndices?: number[];
  // Stick to the BOTTOM instead of the top (RN invertStickyHeaders). Used by inverted lists; an
  // ordinary prop of the scroll node, read off the owner when the behavior builds a pin.
  invertStickyHeaders?: boolean;
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  // iOS-only forwarding props. Harmless on Android (its manager ignores unknown props).
  alwaysBounceHorizontal?: boolean;
  alwaysBounceVertical?: boolean;
  centerContent?: boolean;
  scrollIndicatorInsets?: {
    top?: number;
    left?: number;
    bottom?: number;
    right?: number;
  };
  indicatorStyle?: 'default' | 'black' | 'white';
  directionalLockEnabled?: boolean;
  automaticallyAdjustKeyboardInsets?: boolean;
  contentInsetAdjustmentBehavior?:
    'automatic' | 'scrollableAxes' | 'never' | 'always';
  minimumZoomScale?: number;
  maximumZoomScale?: number;
  zoomScale?: number;
  bouncesZoom?: boolean;
  pinchGestureEnabled?: boolean;
  // Android-only forwarding props. See the header: this one DEFAULTS to true in the behavior.
  nestedScrollEnabled?: boolean;
  overScrollMode?: 'auto' | 'always' | 'never';
  fadingEdgeLength?: number;
  persistentScrollbar?: boolean;
  endFillColor?: string;
  onLayout?: IScrollHandler;
  onScroll?: IScrollHandler;
  onScrollBeginDrag?: IScrollHandler;
  onScrollEndDrag?: IScrollHandler;
  onMomentumScrollBegin?: IScrollHandler;
  onMomentumScrollEnd?: IScrollHandler;
  // iOS-only: user tapped the status bar to scroll to top. Inert on Android.
  onScrollToTop?: IScrollHandler;
  ref?: Ref<IHostInstance>;
  children?: JSX.Element;
}
