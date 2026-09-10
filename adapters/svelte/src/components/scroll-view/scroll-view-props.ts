// `IScrollViewProps`'s canonical home — plain `.ts` file, same reason as view-props.ts's header
// comment (a named type re-exported from a `.svelte` file is invisible to plain `tsc`). Mirrors
// React's/Vue's ScrollViewProps (adapters/react/src/components/scroll-view/shared.ts,
// adapters/vue/src/components/scroll-view/shared.ts) with Svelte's own idioms: `class` (not
// `className`), `children` as a Snippet.
//
// `stickyHeaderIndices` works here since the wrapper was deleted (2026-09-10) — deleting it is what
// turned the feature on. It was unhonored while a component saw only an opaque `Snippet`, with no
// "child at index N" to pull out of a render function; the behavior walks the COMMITTED children
// instead (`behaviors/scroll-view/sticky-indices.test.ts`), which needs no Snippet at all.
//
// The `sticky-header` TAG is the other spelling and still the better one for markup you control: it
// pins by document order, so no index has to stay in step with the children.
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
  // Typed for parity with React/Vue, and DELETED from the payload by the behavior's fold: the axis
  // comes from which tag you wrote. RN derives the native component, the row content style and this
  // flag from one prop so they cannot disagree; a prop contradicting the tag is dropped, with a
  // dlog, rather than producing a shape RN cannot make.
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
