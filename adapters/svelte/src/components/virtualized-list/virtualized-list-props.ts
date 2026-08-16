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
import type { Snippet } from 'svelte';
import type {
  IClassNameValue,
  IStyleProp,
  ISymbioteEvent,
  ISymbioteNode,
  IViewStyle,
} from '@symbiote-native/engine';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
  type ISeparatorProps,
  type ISeparators,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
  type IVirtualizedListHandle,
} from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export type { IVirtualizedListHandle };

export interface IVirtualizedListProps<ItemT> extends IAccessibilityProps, IAriaProps {
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  getItemCount: (data: unknown) => number;
  // The cell renderer. Required, like React's `renderItem` (Vue's twin, #item, is likewise the
  // one non-optional scoped slot).
  item: Snippet<[{ item: ItemT; index: number; separators: ISeparators }]>;
  separator?: Snippet<[ISeparatorProps<ItemT>]>;
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
  // Data indices (into the item stream) that should stick to the top. Unlike ScrollView.svelte
  // (which only ever sees an opaque children Snippet, see scroll-view-props.ts's KNOWN GAP), this
  // component walks an indexable cell list, so it wraps each flagged windowed cell in
  // ScrollViewStickyHeader itself — see index.svelte's sticky wiring.
  stickyHeaderIndices?: number[];
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  onScroll?: (event: ISymbioteEvent) => void;
  onScrollBeginDrag?: (event: ISymbioteEvent) => void;
  onScrollEndDrag?: (event: ISymbioteEvent) => void;
  onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
  onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
  scrollEventThrottle?: number;
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  class?: ISvelteClassValue;
}

// Re-exported so consumers can type a `{@attach}`/host-ref target without reaching into
// @symbiote-native/components directly.
export type { ISeparators, ISeparatorProps, ISymbioteEvent, ISymbioteNode };

// Every IAccessibilityProps field, named explicitly — mirrors React's `...accessibilityRest`
// field-by-field instead of reusing its spread, because this picked object is reused as-is by
// every list component (VirtualizedList's own host-bag construction AND FlatList's/
// SectionList's/VirtualizedSectionList's component-to-component forwarding down to
// VirtualizedList) so the field list lives in exactly one place.
// resolveAccessibilityProps folds aria-*/role into their accessibility* twins first (idempotent —
// calling it twice, once per forwarding hop, is a documented no-op once the aria keys are gone).
export function pickAccessibilityProps<T extends IAccessibilityProps & IAriaProps>(
  props: T,
): IAccessibilityProps {
  const resolved = resolveAccessibilityProps(props);
  const picked: IAccessibilityProps = {};
  if (resolved.testID !== undefined) picked.testID = resolved.testID;
  if (resolved.nativeID !== undefined) picked.nativeID = resolved.nativeID;
  if (resolved.accessible !== undefined) picked.accessible = resolved.accessible;
  if (resolved.accessibilityLabel !== undefined)
    picked.accessibilityLabel = resolved.accessibilityLabel;
  if (resolved.accessibilityHint !== undefined)
    picked.accessibilityHint = resolved.accessibilityHint;
  if (resolved.accessibilityRole !== undefined)
    picked.accessibilityRole = resolved.accessibilityRole;
  if (resolved.accessibilityState !== undefined)
    picked.accessibilityState = resolved.accessibilityState;
  if (resolved.accessibilityValue !== undefined)
    picked.accessibilityValue = resolved.accessibilityValue;
  if (resolved.accessibilityActions !== undefined)
    picked.accessibilityActions = resolved.accessibilityActions;
  if (resolved.accessibilityLabelledBy !== undefined) {
    picked.accessibilityLabelledBy = resolved.accessibilityLabelledBy;
  }
  if (resolved.importantForAccessibility !== undefined) {
    picked.importantForAccessibility = resolved.importantForAccessibility;
  }
  if (resolved.accessibilityLiveRegion !== undefined) {
    picked.accessibilityLiveRegion = resolved.accessibilityLiveRegion;
  }
  if (resolved.screenReaderFocusable !== undefined) {
    picked.screenReaderFocusable = resolved.screenReaderFocusable;
  }
  if (resolved.accessibilityViewIsModal !== undefined) {
    picked.accessibilityViewIsModal = resolved.accessibilityViewIsModal;
  }
  if (resolved.accessibilityElementsHidden !== undefined) {
    picked.accessibilityElementsHidden = resolved.accessibilityElementsHidden;
  }
  if (resolved.accessibilityIgnoresInvertColors !== undefined) {
    picked.accessibilityIgnoresInvertColors = resolved.accessibilityIgnoresInvertColors;
  }
  if (resolved.accessibilityLanguage !== undefined) {
    picked.accessibilityLanguage = resolved.accessibilityLanguage;
  }
  if (resolved.accessibilityRespondsToUserInteraction !== undefined) {
    picked.accessibilityRespondsToUserInteraction = resolved.accessibilityRespondsToUserInteraction;
  }
  if (resolved.accessibilityShowsLargeContentViewer !== undefined) {
    picked.accessibilityShowsLargeContentViewer = resolved.accessibilityShowsLargeContentViewer;
  }
  if (resolved.accessibilityLargeContentTitle !== undefined) {
    picked.accessibilityLargeContentTitle = resolved.accessibilityLargeContentTitle;
  }
  if (resolved.onAccessibilityAction !== undefined)
    picked.onAccessibilityAction = resolved.onAccessibilityAction;
  if (resolved.onAccessibilityTap !== undefined)
    picked.onAccessibilityTap = resolved.onAccessibilityTap;
  if (resolved.onMagicTap !== undefined) picked.onMagicTap = resolved.onMagicTap;
  if (resolved.onAccessibilityEscape !== undefined)
    picked.onAccessibilityEscape = resolved.onAccessibilityEscape;
  return picked;
}
