// The prop surface of `<scroll-view>` / `<horizontal-scroll-view>`, for React.
//
// No component left to type — the element IS the tag, and the engine owns everything the wrapper
// used to assemble: `buildStructure` builds the content node, `slotProps` carries
// `contentContainerStyle` onto it, `claimedChildren` places a `<refresh-control>` child (a sibling
// on iOS, an inverting wrap on Android), and the sticky seam lives in
// `core/components/src/behaviors/scroll-view/`. `../../register` names it.
//
// TWO PROPS ARE NOT WHAT THEY LOOK LIKE, and both were misread as engine gaps before the behavior
// was read rather than the wrapper:
//
//   horizontal            DELETED from the payload and rewritten from the TAG (`ownerFold`,
//                         behaviors/scroll-view/shared.ts). Horizontal scroll is a separate native
//                         ViewManager on Android, so the axis is the tag; a prop contradicting it
//                         is dropped with a dlog rather than producing a shape RN cannot make.
//                         Typed here for parity, and for an app porting from RN.
//   nestedScrollEnabled   defaults to `true` in the behavior, on both platforms, which is what
//                         every wrapper used to write by hand.
//
// `children` is a `ReactNode`, so this type is per-adapter by construction
// (<prop_types_split_agnostic_vs_per_adapter>).
import type { ReactNode } from 'react';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

export type { IScrollViewHandle } from '@symbiote-native/components';

type IScrollHandler = (event: ISymbioteEvent) => void;

export interface IScrollViewProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  // A bare string resolves through the shared style registry, like `className` — not the full
  // IClassNameValue union, since IStyleProp is itself an object/array and that would be ambiguous
  // with a real style.
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
  // NO `refreshControl` PROP, deliberately, and this is the one place the tag's surface diverges
  // from RN's. Write a `<refresh-control>` CHILD instead — the behavior CLAIMS it and places it
  // per platform (a sibling of the content view on iOS, an inverting wrap on Android). Nothing in
  // the engine reads a prop by that name, so typing one would compile and silently paint nothing;
  // leaving it out makes a ported call site fail loudly at `tsc` with this comment beside it.
  removeClippedSubviews?: boolean;
  // Fired when the content container's size changes. RN synthesizes this in JS by putting an
  // onLayout on the inner content view (ScrollView.js _handleContentOnLayout): the native scroll
  // view has no such event of its own. (width, height) in points.
  onContentSizeChange?: (width: number, height: number) => void;
  // Snap / paging family, read directly by the native ViewManager.
  snapToInterval?: number;
  snapToOffsets?: number[];
  snapToAlignment?: 'start' | 'center' | 'end';
  snapToStart?: boolean;
  snapToEnd?: boolean;
  disableIntervalMomentum?: boolean;
  // Honored by the behavior, which walks the COMMITTED children rather than a render function —
  // which is why it needs no wrapper to pull "the child at index N" out of anything.
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
  children?: ReactNode;
  // Forwarded onto the outer scroll host, like `style` — resolves through the shared style
  // registry. It does NOT target `contentContainerStyle`'s content container.
  className?: string;
}
