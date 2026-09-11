// The `<scroll-view>` / `<horizontal-scroll-view>` tag's prop surface — the axis is the TAG you
// write, not a `horizontal` binding, because Android resolves a different native class per axis.
//
// The wrapper was deleted 2026-09-11 and nothing replaced it in the adapter: the ENGINE owns the
// whole shape now (`core/components/src/behaviors/scroll-view/`). `buildStructure` builds the
// content node the children go under, `slotProps` routes `contentContainerStyle` onto it as its
// `style`, `payloadFold` composes the two base styles, and the sticky machinery pins by DOCUMENT
// ORDER through the `<sticky-header>` tag — so the Angular projection bridge that used to wrap
// projected children by index is gone with it, along with its renderer hooks.
//
// A `<refresh-control>` is an ordinary FIRST CHILD on both platforms; the behavior re-parents it
// per platform (iOS a sibling before the content, Android the swipe layout WRAPPING the scroll
// view), which is why the adapter no longer has an `.ios`/`.android` split here.
//
// The imperative surface comes from `buildScrollViewHandle` (`@symbiote-native/components`) over
// the node a template ref hands back.

import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';

export type { IScrollViewHandle } from '@symbiote-native/components';

type IScrollHandler = (event: ISymbioteEvent) => void;
type IContentSizeHandler = (width: number, height: number) => void;

export interface IAngularScrollViewProps
  extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  // A bare string resolves through the shared style registry, like `class` on the host node.
  contentContainerStyle?: IStyleProp<IViewStyle> | string;
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
  snapToInterval?: number;
  snapToOffsets?: number[];
  snapToAlignment?: 'start' | 'center' | 'end';
  snapToStart?: boolean;
  snapToEnd?: boolean;
  disableIntervalMomentum?: boolean;
  // Sticky headers: RN implements stickiness PURELY IN JS — the native scroll view does not honor
  // an index array. The engine's behavior resolves the indices against its own content children.
  stickyHeaderIndices?: number[];
  invertStickyHeaders?: boolean;
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  // iOS-only forwarding props (harmless on Android: its manager ignores unknown props).
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
  // Android-only forwarding props (harmless on iOS).
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
  // Synthesized in JS from the content view's onLayout (RN _handleContentOnLayout); deduped.
  onContentSizeChange?: IContentSizeHandler;
  onAccessibilityAction?: (event: ISymbioteEvent) => void;
  onAccessibilityTap?: (event: ISymbioteEvent) => void;
  onMagicTap?: (event: ISymbioteEvent) => void;
  onAccessibilityEscape?: (event: ISymbioteEvent) => void;
}
