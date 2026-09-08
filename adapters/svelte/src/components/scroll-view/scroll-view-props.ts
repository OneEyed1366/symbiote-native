// `IScrollViewProps`'s canonical home — plain `.ts` file, same reason as view-props.ts's header
// comment (a named type re-exported from a `.svelte` file is invisible to plain `tsc`). Mirrors
// React's/Vue's ScrollViewProps (adapters/react/src/components/scroll-view/shared.ts,
// adapters/vue/src/components/scroll-view/shared.ts) with Svelte's own idioms: `class` (not
// `className`), `children` as a Snippet.
//
// KNOWN GAP — read before wiring `stickyHeaderIndices`: this adapter does NOT auto-wrap children
// by index the way React (Children.toArray) / Vue (slots.default(), a real VNode[]) do. Svelte
// hands a component only an opaque `Snippet` — a render FUNCTION, not an introspectable/indexable
// list of elements — so there is no mechanical way to pull "child at index N" out of it and
// re-wrap it. It is still typed here for interface parity (an app porting from React/Vue
// type-checks against the same surface), but index.svelte dlogs a warning when it is supplied.
// Mark the sections that should pin with the `sticky-header` TAG instead — the ScrollView host
// behavior registers it, finds this ScrollView by walking up, and derives each header's collision
// point from document order, so no index is involved on either side.
//
// `invertStickyHeaders` IS honored: it is an ordinary prop of the scroll node and the behavior
// reads it off the owner when it builds a pin.
import type { Snippet } from 'svelte';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type { IRefreshControlProps } from '../refresh-control-props';
import type { ISvelteClassValue } from '../../class-value';

type IScrollHandler = (event: ISymbioteEvent) => void;

export interface IScrollViewProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  class?: ISvelteClassValue;
  // A bare string resolves through the shared style registry, like `class` — not the full
  // IClassNameValue union, since IStyleProp is itself an object/array and that would be
  // ambiguous with a real style (mirrors React's/Vue's own contentContainerStyle typing).
  contentContainerStyle?: IStyleProp<IViewStyle> | string;
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
  // The REAL RefreshControl's own prop bag, minus `children` — ScrollView instantiates it as an
  // ordinary child and the ScrollView host behavior claims it, placing it beside the content view
  // on iOS and inverting the tree on Android. A props object rather than React's/Vue's
  // rendered-element shape because Svelte has no cloneElement to re-parent one with.
  refreshControl?: Omit<IRefreshControlProps, 'children'>;
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
  // See the KNOWN GAP note above — not auto-honored in this adapter.
  stickyHeaderIndices?: number[];
  invertStickyHeaders?: boolean;
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  // iOS-only forwarding props; harmless on Android (its manager ignores unknown props).
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
  // Android-only forwarding props; harmless on iOS.
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
  children?: Snippet;
}
