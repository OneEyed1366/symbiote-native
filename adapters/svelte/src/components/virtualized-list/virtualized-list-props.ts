// `IVirtualizedListProps`'s canonical home. Per CLAUDE.md's
// <prop_types_split_agnostic_vs_per_adapter>: the cell renderer (`item`) is a Svelte Snippet —
// a framework element, not an agnostic value — so this type is INHERENTLY per-adapter, never
// shared verbatim from @symbiote-native/components (mirrors React's `renderItem` / Vue's `#item`
// scoped slot, each declared separately for the same reason). The windowing STATE/logic
// (reduceList, buildListPlan, …) is shared verbatim; only this prop surface is hand-declared.
//
// Snippet props are Svelte's idiomatic render-prop mechanism (closest cousin to React's
// renderItem-as-a-prop, unlike Vue's scoped-slot form) — `item`/`separator`/`header`/`footer`/
// `empty` all follow the same shape View.svelte's `children: Snippet` already uses.
import type { Component, Snippet } from 'svelte';
import {
  ARIA_ALIAS_KEYS,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  type IAccessibilityProps,
  type IAriaProps,
  type ICellRendererBaseProps,
  type IInnerViewRef,
  type ISeparatorProps,
  type ISeparators,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
  type IVirtualizedListHandle,
} from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export type { IVirtualizedListHandle };

// What a `cellRenderer` snippet is handed, the item and its separator arrive as `children`
export type ICellRendererProps<ItemT> = ICellRendererBaseProps<ItemT> & {
  children: Snippet;
};

// What an `item` snippet and a `listItemComponent` are both handed
export type IListItemInfo<ItemT> = {
  item: ItemT;
  index: number;
  separators: ISeparators;
};

export type IVirtualizedListProps<ItemT> = IAccessibilityProps &
  IAriaProps & {
    data: unknown;
    getItem: (data: unknown, index: number) => ItemT;
    getItemCount: (data: unknown) => number;
    // The cell renderer, like React's `renderItem`. One of `item` and `listItemComponent` is
    // required, the component wins when both are given
    item?: Snippet<[IListItemInfo<ItemT>]>;
    // RN's `ListItemComponent`: a component taking `item`, `index` and `separators` as props
    listItemComponent?: Component<IListItemInfo<ItemT>>;
    separator?: Snippet<[ISeparatorProps<ItemT>]>;
    // Replaces the view around each cell, it must wire `onLayout` and `onFocus` itself
    cellRenderer?: Snippet<[ICellRendererProps<ItemT>]>;
    header?: Snippet;
    footer?: Snippet;
    empty?: Snippet;
    keyExtractor?: (item: ItemT, index: number) => string;
    getItemLayout?: (
      data: unknown,
      index: number,
    ) => { length: number; offset: number; index: number };
    horizontal?: boolean;
    inverted?: boolean;
    // Opaque marker prop kept for RN-surface parity: reading it inside a $derived.by already forces
    // that derived to re-run when it changes, so — unlike React/Vue, which need no wiring beyond
    // reading it as a render dependency — Svelte's fine-grained reactivity makes this a genuine no-op
    // UNLESS the caller's own closures read external state the compiler cannot see. Voided in the
    // component; kept in the prop surface for RN/React/Vue parity.
    extraData?: unknown;
    onEndReached?: (info: { distanceFromEnd: number }) => void;
    onEndReachedThreshold?: number;
    onStartReached?: (info: { distanceFromStart: number }) => void;
    onStartReachedThreshold?: number;
    // Pull-to-refresh. When onRefresh is set, the real RefreshControl (adapters/svelte/src/
    // components/RefreshControl.svelte) is attached to the raw scroll intrinsics this file hand-
    // authors — see index.svelte's header comment for the sibling(iOS)/wrap(Android) wiring, the
    // same shape ScrollView's own RefreshControl attachment uses. refreshing defaults to false when
    // nullish, mirroring RN.
    onRefresh?: () => void;
    refreshing?: boolean | null;
    progressViewOffset?: number;
    onViewableItemsChanged?: (info: IViewableItemsChangedInfo<ItemT>) => void;
    viewabilityConfig?: IViewabilityConfig;
    viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
    onScrollToIndexFailed?: (info: {
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    }) => void;
    initialNumToRender?: number;
    initialScrollIndex?: number;
    maxToRenderPerBatch?: number;
    updateCellsBatchingPeriod?: number;
    windowSize?: number;
    // Mounts every cell from the top and paints no spacer, the window only grows toward the end
    disableVirtualization?: boolean;
    // Data indices (into the item stream) that should stick to the top. Unlike ScrollView.svelte
    // (which only ever sees an opaque children Snippet, see scroll-view-props.ts's KNOWN GAP), this
    // component walks an indexable cell list, so it wraps each flagged windowed cell in
    // `sticky-header` tag itself — see index.svelte's sticky wiring.
    stickyHeaderIndices?: number[];
    maintainVisibleContentPosition?: {
      minIndexForVisible: number;
      autoscrollToTopThreshold?: number;
    };
    onScroll?: (event: ISymbioteEvent) => void;
    onContentSizeChange?: (width: number, height: number) => void;
    onScrollBeginDrag?: (event: ISymbioteEvent) => void;
    onScrollEndDrag?: (event: ISymbioteEvent) => void;
    onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
    onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
    scrollEventThrottle?: number;
    keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
    keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
    removeClippedSubviews?: boolean;
    nestedScrollEnabled?: boolean;
    stickyHeaderHiddenOnScroll?: boolean;
    innerViewRef?: IInnerViewRef;
    style?: IStyleProp<IViewStyle>;
    contentContainerStyle?: IStyleProp<IViewStyle>;
    listHeaderComponentStyle?: IStyleProp<IViewStyle>;
    listFooterComponentStyle?: IStyleProp<IViewStyle>;
    class?: ISvelteClassValue;
  };

// Re-exported so consumers can type a `bind:this` target without reaching into
// @symbiote-native/components directly.
export type { ISeparators, ISeparatorProps, ISymbioteEvent, ISymbioteNode };

const ACCESSIBILITY_KEYS = [
  'testID',
  'nativeID',
  'accessible',
  'accessibilityLabel',
  'accessibilityHint',
  'accessibilityRole',
  'accessibilityState',
  'accessibilityValue',
  'accessibilityActions',
  'accessibilityLabelledBy',
  'importantForAccessibility',
  'accessibilityLiveRegion',
  'screenReaderFocusable',
  'accessibilityViewIsModal',
  'accessibilityElementsHidden',
  'accessibilityIgnoresInvertColors',
  'accessibilityLanguage',
  'accessibilityRespondsToUserInteraction',
  'accessibilityShowsLargeContentViewer',
  'accessibilityLargeContentTitle',
  'onAccessibilityAction',
  'onAccessibilityTap',
  'onMagicTap',
  'onAccessibilityEscape',
] as const satisfies readonly (keyof IAccessibilityProps)[];

// Named keys instead of a `...rest` spread: a custom-element host tag takes an object bag
// Aria keys go through RAW, the engine folds them once at the leaf (`foldAriaProps`)
// The pick is idempotent, so it can run again across a forwarding hop
export function pickAccessibilityProps<
  T extends IAccessibilityProps & IAriaProps,
>(props: T): IAccessibilityProps & IAriaProps {
  const picked: IAccessibilityProps & IAriaProps = {};
  for (const key of [...ACCESSIBILITY_KEYS, ...ARIA_ALIAS_KEYS]) {
    const value = props[key];
    // `Object.assign` keeps the correlated key/value types sound without an `as`
    if (value !== undefined) Object.assign(picked, { [key]: value });
  }
  return picked;
}
