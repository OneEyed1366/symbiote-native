// The props every adapter hands to the scroll tag a list renders

import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IInnerViewRef } from '../behaviors/scroll-view/inner-view-ref';
import type { IContentSizeHandler } from './list-types';
import {
  contentContainerStyleOf,
  listStyleOf,
  maintainPositionForScroll,
} from './list-view';

type IScrollHandler = (event: ISymbioteEvent) => void;

type IKeyboardTaps = boolean | 'always' | 'never' | 'handled';
type IKeyboardDismiss = 'none' | 'on-drag' | 'interactive';

// Props that ride to the tag only when the app gave them, the tag tells absent from `undefined`
type IOptionalScrollProps = {
  onScrollBeginDrag?: IScrollHandler;
  onScrollEndDrag?: IScrollHandler;
  onMomentumScrollBegin?: IScrollHandler;
  onMomentumScrollEnd?: IScrollHandler;
  scrollEventThrottle?: number;
  keyboardShouldPersistTaps?: IKeyboardTaps;
  keyboardDismissMode?: IKeyboardDismiss;
  removeClippedSubviews?: boolean;
  nestedScrollEnabled?: boolean;
  stickyHeaderHiddenOnScroll?: boolean;
  onContentSizeChange?: IContentSizeHandler;
  innerViewRef?: IInnerViewRef;
};

export type IListScrollSource = IOptionalScrollProps & {
  horizontal: boolean;
  inverted: boolean;
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  total: number;
  hasHeader: boolean;
  // The offset driven imperatively before the scroll node is live
  commandedOffset: { x: number; y: number } | undefined;
  onScroll: IScrollHandler;
  onLayout: IScrollHandler;
};

export type IListScrollProps = IOptionalScrollProps & {
  style: IStyleProp<IViewStyle> | undefined;
  contentContainerStyle: IStyleProp<IViewStyle> | undefined;
  onScroll: IScrollHandler;
  onLayout: IScrollHandler;
  isInvertedVirtualizedList?: boolean;
  contentOffset?: { x: number; y: number };
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
};

const OPTIONAL_KEYS = [
  'onScrollBeginDrag',
  'onScrollEndDrag',
  'onMomentumScrollBegin',
  'onMomentumScrollEnd',
  'scrollEventThrottle',
  'keyboardShouldPersistTaps',
  'keyboardDismissMode',
  'removeClippedSubviews',
  'nestedScrollEnabled',
  'stickyHeaderHiddenOnScroll',
  'onContentSizeChange',
  'innerViewRef',
] as const satisfies readonly (keyof IOptionalScrollProps)[];

// What a plain view keeps of the props a scroll tag took: the scroll-only ones go
export function viewPropsOf(
  forwarded: Record<string, unknown>,
): Record<string, unknown> {
  const kept = { ...forwarded };
  for (const key of OPTIONAL_KEYS) delete kept[key];
  return kept;
}

// `horizontal` and `stickyHeaderIndices` stay out of the bag, the axis and pinned cells are tags
// `base` is spread first, so the windowing props always win over what the adapter passes through
export function buildListScrollProps<TBase extends object>(
  source: IListScrollSource,
  base: TBase,
): TBase & IListScrollProps {
  const props: IListScrollProps = {
    style: listStyleOf(source, source.style),
    contentContainerStyle: contentContainerStyleOf(
      source.horizontal,
      source.contentContainerStyle,
      source.total,
    ),
    onScroll: source.onScroll,
    onLayout: source.onLayout,
  };
  // Android moves the scrollbar back after its `scale: -1` flip
  if (source.inverted) props.isInvertedVirtualizedList = true;
  if (source.commandedOffset !== undefined) {
    props.contentOffset = source.commandedOffset;
  }
  const mvcp = maintainPositionForScroll(
    source.maintainVisibleContentPosition,
    source.hasHeader,
  );
  if (mvcp !== undefined) props.maintainVisibleContentPosition = mvcp;
  for (const key of OPTIONAL_KEYS) {
    const value = source[key];
    if (value !== undefined) Object.assign(props, { [key]: value });
  }
  return { ...base, ...props };
}
