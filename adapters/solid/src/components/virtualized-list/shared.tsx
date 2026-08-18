// VirtualizedList — real windowing over a hand-authored scroll host. Only the cells whose computed
// offset falls inside the visible window (plus a leading/trailing buffer) exist as native views;
// everything above and below collapses into spacers whose sizes sum to the off-screen extent, so the
// scroll thumb and total content size stay right without mounting all N rows.
//
// The orchestration — window recompute, edge-reached, viewability, batch fill, MVCP, the imperative
// scrolls — is the framework-agnostic `reduceList` state machine in @symbiote-native/components,
// shared verbatim with React, Vue, Svelte and Angular. So is every geometry leaf (`buildListPlan`,
// `computeWindow`, `resolveItemKey`, …) and every scroll-host helper ScrollView also uses
// (`selectScrollIntrinsics`, `resolveScrollForwarding`, `splitLayoutProps`, `buildScrollViewHandle`,
// `attachStickyScroll`, `forwardScrollEvent`). Solid supplies ONLY its lifecycle: it turns native
// events into ACTIONS, holds ONE plain state cell, runs the returned EFFECTS with Solid primitives,
// and assembles the host elements. Lists have no Descriptor render fn — the cell content is the
// user's own subtree (`symbiote-add-component` §0, category 2).
//
// WHY THIS FILE HAND-AUTHORS THE SCROLL INTRINSICS INSTEAD OF RENDERING <ScrollView>, which is what
// adapters/react and adapters/vue do. ScrollView takes an OPAQUE children slot, so its sticky path
// has to resolve those children through solid's `children()` helper and re-wrap the whole list every
// time any of them changes — and here "any of them changes" is every scroll event, which would tear
// down and rebuild every sticky header mid-scroll (losing its measured layout each time). Walking
// `plan.cells` instead lets this file wrap the flagged CELL itself, once, inside the keyed <For> row
// that owns it. Same conclusion, same reason, as adapters/svelte's index.svelte.
//
// THREE SOLID FACTS DRIVE THE REST, and none of them is cosmetic (.claude/rules/
// solid-descriptor-bridge.md):
//
// 1. A component body runs ONCE and `insert` REPLACES rather than diffing. So the cells ride a keyed
//    <For> over the cell KEY strings — <For> matches by value identity, which is what makes a row
//    MOVE as the window slides instead of being destroyed and rebuilt. <Index> would have been
//    exactly wrong here: it keys by position, so row 0 would be reused for a different item on every
//    scroll and its whole `renderItem` subtree would be rebuilt each step.
// 2. `renderItem` is a render prop, so its info arrives as an ACCESSOR and the call is untracked — a
//    tracked call would rebuild the cell subtree on every change (trap 4). Same shape
//    `<For>{(item, index) => …}` and Pressable's child already use.
// 3. The scroll AXIS picks a different host TAG and Solid cannot swap a tag under a live node — so
//    the flip is an explicit rebuild boundary (trap 5), with the build untracked so every other prop
//    re-props the SAME nodes through `spread`.
//
// The ONE thing that differs per platform is where the RefreshControl sits: a childless SIBLING
// before the content on iOS, WRAPPING the whole scroll host on Android (an Android ScrollView takes
// exactly one child). That is `IScrollViewHostPlatform.refreshControlMode`, the same fact this
// adapter's ScrollView encodes, so the two platform barrels feed it in.

import {
  For,
  Show,
  createEffect,
  createMemo,
  createRenderEffect,
  createSignal,
  on,
  onCleanup,
  splitProps,
  untrack,
  type Accessor,
  type Ref,
} from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import {
  DEFAULT_END_REACHED_THRESHOLD,
  DEFAULT_INITIAL_NUM_TO_RENDER,
  DEFAULT_MAX_TO_RENDER_PER_BATCH,
  DEFAULT_START_REACHED_THRESHOLD,
  DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
  DEFAULT_WINDOW_SIZE,
  EMPTY_OFFSET,
  FIRST_INDEX,
  NO_INDEX,
  INVERTED_X_STYLE,
  INVERTED_Y_STYLE,
  buildListPlan,
  buildScrollViewHandle,
  buildViewabilityPairs,
  nextStickyHeaderY,
  isSeparatorGapInRange,
  listEffectSignature,
  attachStickyScroll,
  forwardScrollEvent,
  resolveAccessibilityProps,
  resolveScrollForwarding,
  splitLayoutProps,
  selectScrollIntrinsics,
  createInitialListState,
  readLayoutLength,
  readLayoutOffset,
  readLayoutNumber,
  readScrollOffset,
  reduceList,
  resolveItemKey,
  type IListAction,
  type IListCellPlan,
  type IListPlan,
  type IListReducerInputs,
  type IListEffect,
  type IListState,
  type IAccessibilityProps,
  type IAriaProps,
  type ICellLayout,
  type IScrollViewHandle,
  type ISymbioteIntrinsic,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
  type ISeparatorProps,
  type ISeparators,
  type IViewToken,
  type IVirtualizedListHandle,
} from '@symbiote-native/components';
import {
  AnimatedValue,
  dlog,
  event as animatedEvent,
  getNativeTag,
  isNativeAnimatedAvailable,
  isSymbioteNode,
  whenCommitted,
  resolveClassName,
  type IClassNameValue,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  createElement,
  insert,
  insertNode,
  setProp,
  spread,
} from '../../renderer';
import { withStableKeys } from '../../utils/stable-keys';
import { RefreshControl } from '../refresh-control';
import { ScrollViewStickyHeader } from '../scroll-view/sticky-header';
import type { IScrollViewHostPlatform } from '../scroll-view/shared';

export type { IScrollViewHostPlatform };

// Re-exported so app code (and the package barrel) keeps ONE import path for the shared list types,
// exactly as React's virtualized-list/index.ts re-exports them.
export type {
  ICellLayout,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IVirtualizedListHandle,
};

// What `renderItem` is handed. React/Vue/Svelte/Angular pass this as a VALUE; here it arrives as an
// ACCESSOR, and that divergence is a fix for a real device bug rather than a style choice — the same
// one Pressable's child took. Every other adapter has a node-reusing layer under the render prop
// (React reconciles, Vue patches vnodes, Svelte updates a Snippet in place); Solid has none, so the
// reactivity must cross as an accessor and only the leaf that reads it re-runs.
export interface IVirtualizedListCellInfo<ItemT> {
  item: ItemT;
  index: number;
  separators: ISeparators;
}

export type IVirtualizedListRenderItem<ItemT> = (
  info: Accessor<IVirtualizedListCellInfo<ItemT>>,
) => JSX.Element;

export interface IVirtualizedListProps<ItemT>
  extends IAccessibilityProps, IAriaProps {
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  getItemCount: (data: unknown) => number;
  renderItem: IVirtualizedListRenderItem<ItemT>;
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
  initialNumToRender?: number;
  windowSize?: number;
  // Elements, not components — Solid's idiomatic spelling for a fixed slot, and the shape
  // ScrollView's `refreshControl` already takes. Each is read ONCE: a JSX prop is a getter that
  // BUILDS the element on read, so a second read would build a second node.
  ListHeaderComponent?: JSX.Element;
  ListFooterComponent?: JSX.Element;
  ListEmptyComponent?: JSX.Element;
  // A component, not an element: its props change over time (the highlight flag a row flips), so it
  // has to be INSTANTIATED per gap with live props rather than read once.
  ItemSeparatorComponent?: (props: ISeparatorProps<ItemT>) => JSX.Element;
  // The imperative handle, NOT the host node — the same thing React exposes through
  // useImperativeHandle. Solid's compiler turns `ref={list}` on a component into a callback prop, so
  // a plain variable at the call site receives the handle.
  ref?: Ref<IVirtualizedListHandle>;
  onEndReached?: (info: { distanceFromEnd: number }) => void;
  onEndReachedThreshold?: number;
  onStartReached?: (info: { distanceFromStart: number }) => void;
  onStartReachedThreshold?: number;
  keyExtractor?: (item: ItemT, index: number) => string;
  onViewableItemsChanged?: (info: IViewableItemsChangedInfo<ItemT>) => void;
  viewabilityConfig?: IViewabilityConfig;
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  // RN's _onScroll runs its windowing bookkeeping and THEN calls this: the user's handler COMPOSES
  // with the internal one, it never replaces it.
  onScroll?: (event: ISymbioteEvent) => void;
  // Forwarded straight to the native scroll host (RN VirtualizedList.js).
  onScrollBeginDrag?: (event: ISymbioteEvent) => void;
  onScrollEndDrag?: (event: ISymbioteEvent) => void;
  onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
  onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
  scrollEventThrottle?: number;
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  horizontal?: boolean;
  inverted?: boolean;
  style?: IStyleProp<IViewStyle>;
  // A bare STRING resolves through the shared style registry too, matching this adapter's own
  // ScrollView (React's contentContainerStyle is style-object-only).
  contentContainerStyle?: IStyleProp<IViewStyle> | string;
  // Solid's spelling for a registered class name, matching View / Text / ScrollView (React's is
  // `className`). Resolved through the shared style registry by routeProp's class+style merge.
  class?: IClassNameValue;
  // Pull-to-refresh. When onRefresh is set a real RefreshControl is attached to the scroll host;
  // `refreshing` is the CONTROLLED spinner state (RN defaults it to false when nullish) and
  // progressViewOffset nudges where the spinner rests.
  onRefresh?: () => void;
  refreshing?: boolean | null;
  progressViewOffset?: number;
  // Data indices (into the item stream) that stick to the top as they scroll off. RN implements this
  // purely in JS, so the flagged CELL is wrapped here and the array is never forwarded to native.
  stickyHeaderIndices?: number[];
  // Keep the visually-anchored item in place when content is prepended. RN both forwards this to
  // native AND shifts the scroll in JS; the JS half covers the prepended items collapsed into the
  // leading SPACER, which native cannot see.
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  initialScrollIndex?: number;
  // RN's incremental fill: at most this many new cells per batch, one batch every
  // updateCellsBatchingPeriod milliseconds.
  maxToRenderPerBatch?: number;
  updateCellsBatchingPeriod?: number;
  // Kept for RN/React surface parity, and a genuine no-op here: a Solid cell's content is a live
  // reactive subtree, so a signal the app reads inside renderItem already updates the leaf that reads
  // it. RN needs extraData only to bust a PureComponent cell.
  extraData?: unknown;
  onScrollToIndexFailed?: (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => void;
}

// Consumed by the lifecycle itself; everything LEFT OVER is the accessibility surface, which rides
// down onto the scroll host exactly as React spreads `...accessibilityRest` onto its ScrollView.
const HANDLED_PROPS = [
  'data',
  'getItem',
  'getItemCount',
  'renderItem',
  'getItemLayout',
  'initialNumToRender',
  'windowSize',
  'ListHeaderComponent',
  'ListFooterComponent',
  'ListEmptyComponent',
  'ItemSeparatorComponent',
  'ref',
  'onEndReached',
  'onEndReachedThreshold',
  'onStartReached',
  'onStartReachedThreshold',
  'keyExtractor',
  'onViewableItemsChanged',
  'viewabilityConfig',
  'viewabilityConfigCallbackPairs',
  'onScroll',
  'onScrollBeginDrag',
  'onScrollEndDrag',
  'onMomentumScrollBegin',
  'onMomentumScrollEnd',
  'scrollEventThrottle',
  'keyboardShouldPersistTaps',
  'keyboardDismissMode',
  'horizontal',
  'inverted',
  'style',
  'contentContainerStyle',
  'class',
  'onScrollToIndexFailed',
  'onRefresh',
  'refreshing',
  'progressViewOffset',
  'stickyHeaderIndices',
  'maintainVisibleContentPosition',
  'initialScrollIndex',
  'maxToRenderPerBatch',
  'updateCellsBatchingPeriod',
  'extraData',
] as const;

// A ListHeaderComponent occupies child 0 of the content container, which shifts every data index
// native MVCP anchors against by one (RN VirtualizedList.js does the same bump).
const HEADER_CHILD_COUNT = 1;

export type IVirtualizedListComponent = <ItemT>(
  props: IVirtualizedListProps<ItemT>,
) => JSX.Element;

export function createVirtualizedList(
  platform: IScrollViewHostPlatform,
): IVirtualizedListComponent {
  return function VirtualizedList<ItemT>(
    props: IVirtualizedListProps<ItemT>,
  ): JSX.Element {
    // The ONE folded state cell (RN's scattered refs collapsed into IListState). A plain object, never
    // a signal: nothing reads it reactively.
    const headerElement = untrack(() => props.ListHeaderComponent);
    const footerElement = untrack(() => props.ListFooterComponent);
    const emptyElement = untrack(() => props.ListEmptyComponent);

    // The scroll host, held by IDENTITY in a plain variable: a store or any proxy wrapper would be a
    // different key than the one the engine's commit mirror holds, and every imperative command would
    // silently no-op (symbiote-engine-core §3).
    let hostNode: ISymbioteNode | null = null;
    // A LAZY node getter, not the node captured once: it is null until the tree builds, and every
    // command re-reads it.
    const scrollHandle = buildScrollViewHandle(() => hostNode);

    const [, accessibilityRest] = splitProps(props, HANDLED_PROPS);

    const isHorizontal = (): boolean => props.horizontal === true;

    // Drives every sticky header's translateY (RN's _scrollAnimatedValue). Allocated unconditionally,
    // exactly like React's unconditional hook, and held by identity.
    const scrollAnimatedValue = new AnimatedValue(0);
    // Sticky cross-talk (RN's _headerLayoutYs): a data-index -> measured-y map so each header learns
    // where the NEXT one starts, its push-off collision point. Mutated imperatively from each
    // header's onLayout; the version bump is what lets the PREVIOUS header re-read it.
    const headerLayoutYs = new Map<number, number>();
    const [stickyVersion, setStickyVersion] = createSignal(0);
    const stickySet = createMemo(() =>
      props.stickyHeaderIndices !== undefined
        ? new Set(props.stickyHeaderIndices)
        : undefined,
    );
    const hasStickyHeaders = (): boolean => {
      const indices = props.stickyHeaderIndices;
      return indices !== undefined && indices.length > FIRST_INDEX;
    };
    const nativeStickyAvailable = (): boolean =>
      hasStickyHeaders() && isNativeAnimatedAvailable();
    // RN's FlatList/SectionList expose no invertStickyHeaders of their own (only ScrollView does), so
    // list headers always pin to the top and the inverted viewport capture is never needed.
    const forwarding = createMemo(() =>
      resolveScrollForwarding({
        hasStickyHeaders: hasStickyHeaders(),
        nativeStickyAvailable: nativeStickyAvailable(),
        invertStickyHeaders: undefined,
        scrollEventThrottle: props.scrollEventThrottle,
        maintainVisibleContentPosition: props.maintainVisibleContentPosition,
        snapToAlignment: undefined,
      }),
    );
    // Inversion flips the scroll container along the scroll axis; each cell re-flips so its own content
    // stays upright (RN does the same with a scale(-1) transform). The content CONTAINER is left alone
    // — flipping it too would cancel the outer flip.
    const invertedStyle = (): IViewStyle | undefined => {
      if (props.inverted !== true) return undefined;
      return isHorizontal() ? INVERTED_X_STYLE : INVERTED_Y_STYLE;
    };

    const listState: IListState<ItemT> = createInitialListState<ItemT>();
    // Bumped on every render-relevant transition; that bump is what re-derives `metrics`. listState is
    // a plain object, so mutating it triggers nothing on its own.
    const [version, setVersion] = createSignal(0);
    // Per-gap separator overrides, keyed by the LEADING cell index of the gap. Render state read
    // directly in the cell walk, not part of the windowing orchestration, so it stays adapter-side.
    const separatorOverrides = new Map<
      number,
      Partial<ISeparatorProps<ItemT>>
    >();
    const [separatorVersion, setSeparatorVersion] = createSignal(0);
    // The adapter owns the timers; the reducer only asks for a delay.
    let viewableTimer: ReturnType<typeof setTimeout> | null = null;
    let batchTimer: ReturnType<typeof setTimeout> | null = null;
    // The offset we are imperatively driving native to before the host node has a Fabric tag. Rides
    // down as the scroll host's contentOffset prop; fresh object identity each push.
    const [commandedOffset, setCommandedOffset] = createSignal<
      { x: number; y: number } | undefined
    >(undefined);

    function inputs(): IListReducerInputs<ItemT> {
      return {
        data: props.data,
        getItem: props.getItem,
        getItemCount: props.getItemCount,
        keyExtractor: props.keyExtractor,
        getItemLayout: props.getItemLayout,
        horizontal: isHorizontal(),
        windowSize: props.windowSize ?? DEFAULT_WINDOW_SIZE,
        initialNumToRender:
          props.initialNumToRender ?? DEFAULT_INITIAL_NUM_TO_RENDER,
        maxToRenderPerBatch:
          props.maxToRenderPerBatch ?? DEFAULT_MAX_TO_RENDER_PER_BATCH,
        updateCellsBatchingPeriod:
          props.updateCellsBatchingPeriod ??
          DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
        onEndReachedThreshold:
          props.onEndReachedThreshold ?? DEFAULT_END_REACHED_THRESHOLD,
        onStartReachedThreshold:
          props.onStartReachedThreshold ?? DEFAULT_START_REACHED_THRESHOLD,
        maintainVisibleContentPosition: props.maintainVisibleContentPosition,
        initialScrollIndex: props.initialScrollIndex,
        onEndReachedActive: props.onEndReached !== undefined,
        onStartReachedActive: props.onStartReached !== undefined,
        viewabilityPairs: buildViewabilityPairs(
          props.onViewableItemsChanged,
          props.viewabilityConfig,
          props.viewabilityConfigCallbackPairs,
        ),
      };
    }

    function keyFor(index: number): string {
      return resolveItemKey(
        props.getItem(props.data, index),
        index,
        props.keyExtractor,
      );
    }

    // The work the reducer asked for, run with Solid's own primitives. The reducer DESCRIBES an
    // effect; which timer holds a debounce and how a native scroll is dispatched stay here.
    function runEffects(effects: IListEffect<ItemT>[]): void {
      for (const effect of effects) {
        switch (effect.kind) {
          case 'scroll-to': {
            const clamped = Math.max(EMPTY_OFFSET, effect.offset);
            const target = {
              x: isHorizontal() ? clamped : EMPTY_OFFSET,
              y: isHorizontal() ? EMPTY_OFFSET : clamped,
            };
            // A native scrollTo needs the node's COMMITTED Fabric tag; this adapter commits on a
            // microtask, so a scroll requested in the same tick as mount has none yet.
            // contentOffset is RN's own pre-commit fallback.
            const node = hostNode;
            if (node !== null && getNativeTag(node) !== undefined) {
              dlog(
                `VirtualizedList scrollTo offset=${clamped} animated=${effect.animated}`,
              );
              setCommandedOffset(undefined);
              scrollHandle.scrollTo({ ...target, animated: effect.animated });
              break;
            }
            dlog(`VirtualizedList scrollTo offset=${clamped} pending-commit`);
            setCommandedOffset(target);
            break;
          }
          case 'fire-end-reached':
            props.onEndReached?.({ distanceFromEnd: effect.distanceFromEnd });
            break;
          case 'fire-start-reached':
            props.onStartReached?.({
              distanceFromStart: effect.distanceFromStart,
            });
            break;
          case 'fire-viewable': {
            const pairs = inputs().viewabilityPairs;
            const info = effect.info;
            const map = effect.map;
            // lastViewable is folded back only when the fire actually LANDS, so a debounce superseded
            // mid-flight still diffs against the last committed set.
            const fire = (): void => {
              for (const pair of pairs) pair.onViewableItemsChanged(info);
              dispatch({ kind: 'viewable-fired', map });
            };
            if (viewableTimer !== null) {
              clearTimeout(viewableTimer);
              viewableTimer = null;
            }
            if (effect.delay > EMPTY_OFFSET) {
              viewableTimer = setTimeout(() => {
                viewableTimer = null;
                fire();
              }, effect.delay);
            } else {
              fire();
            }
            break;
          }
          case 'schedule-refill':
            // Ask for another render tick so the throttled window keeps growing toward its target.
            if (batchTimer !== null) clearTimeout(batchTimer);
            batchTimer = setTimeout(() => {
              batchTimer = null;
              dispatch({ kind: 'batch-tick' });
            }, effect.delay);
            break;
          case 'fire-scroll-to-index-failed':
            props.onScrollToIndexFailed?.({
              index: effect.index,
              highestMeasuredFrameIndex: effect.highestMeasuredFrameIndex,
              averageItemLength: effect.averageItemLength,
            });
            break;
        }
      }
    }

    // Untracked by construction: dispatch is reached from native events, timers and the imperative
    // handle, never from a render position, and reading every prop through inputs() inside a tracked
    // scope would subscribe that scope to the whole prop surface.
    function dispatch(action: IListAction<ItemT>): void {
      untrack(() => {
        const result = reduceList(listState, action, inputs());
        runEffects(result.effects);
        if (result.changed) setVersion(tick => tick + 1);
      });
    }

    // RN animates every imperative scroll unless the caller passes animated: false; each resolves to an
    // offset inside the reducer and then rides the native scrollTo command.
    const handle: IVirtualizedListHandle = {
      scrollToOffset: (params: {
        offset: number;
        animated?: boolean;
      }): void => {
        dispatch({
          kind: 'scroll-to-offset',
          offset: params.offset,
          animated: params.animated ?? true,
        });
      },
      scrollToIndex: (params: {
        index: number;
        animated?: boolean;
        viewOffset?: number;
        viewPosition?: number;
      }): void => {
        dispatch({
          kind: 'scroll-to-index',
          index: params.index,
          animated: params.animated ?? true,
          viewPosition: params.viewPosition ?? FIRST_INDEX,
          viewOffset: params.viewOffset ?? EMPTY_OFFSET,
        });
      },
      scrollToItem: (params: {
        item: unknown;
        animated?: boolean;
        viewPosition?: number;
      }): void => {
        dispatch({
          kind: 'scroll-to-item',
          item: params.item,
          animated: params.animated ?? true,
          viewPosition: params.viewPosition ?? FIRST_INDEX,
        });
      },
      scrollToEnd: (params?: { animated?: boolean }): void => {
        dispatch({ kind: 'scroll-to-end', animated: params?.animated ?? true });
      },
      flashScrollIndicators: (): void => {
        scrollHandle.flashScrollIndicators();
      },
      // Three names for RN-API parity; SymbioteNative has no findNodeHandle / legacy-instance
      // distinction, so all three route to the same underlying handle (see IScrollRoutingHandle).
      getNativeScrollRef: (): IScrollViewHandle | null => scrollHandle,
      getScrollableNode: (): IScrollViewHandle | null => scrollHandle,
      getScrollResponder: (): IScrollViewHandle | null => scrollHandle,
      getScrollNode: (): ISymbioteNode | null => scrollHandle.getScrollNode(),
      // RN's recordInteraction: flip the interaction flag so waitForInteraction viewability configs
      // start reporting.
      recordInteraction: (): void => {
        dispatch({ kind: 'record-interaction' });
      },
    };
    // Solid's `ref` is a COMPILE-TIME construct: a `ref={list}` call site has already been rewritten
    // into a callback by the time this body reads it (utils/host-ref.ts has the full rationale).
    if (typeof props.ref === 'function') props.ref(handle);

    function onViewportLayout(event: ISymbioteEvent): void {
      const length = readLayoutLength(event, isHorizontal());
      if (length === undefined) return;
      dlog(`VirtualizedList onLayout viewport=${length}`);
      dispatch({ kind: 'layout', length });
    }

    // Without getItemLayout the list learns its cell sizes from each cell's own onLayout, which is
    // what fills the offset table the window and the spacers are computed from.
    function makeCellMeasure(
      index: Accessor<number>,
    ): (event: ISymbioteEvent) => void {
      return (event: ISymbioteEvent): void => {
        const length = readLayoutLength(event, isHorizontal());
        if (length === undefined) return;
        const offset = readLayoutOffset(event, isHorizontal());
        dlog(
          `VirtualizedList cell ${index()} measured length=${length} offset=${offset ?? 'none'}`,
        );
        dispatch({ kind: 'measure', index: index(), length, offset });
      };
    }

    function handleScroll(event: ISymbioteEvent): void {
      const offset = readScrollOffset(event, isHorizontal());
      if (offset === undefined) return;
      dlog(`VirtualizedList onScroll offset=${offset}`);
      // A real user/native scroll supersedes any pending commanded offset.
      setCommandedOffset(undefined);
      dispatch({ kind: 'scroll', offset });
      // Compose, don't clobber: internal windowing ran first, now the user's onScroll.
      props.onScroll?.(event);
    }

    // Without the native animated module the sticky value has to be driven off the JS thread, so the
    // handler is wrapped in Animated.event; the native and plain paths forward it untouched.
    const scrollHandler = createMemo((): unknown => {
      if (forwarding().mode !== 'sticky-js') return handleScroll;
      return animatedEvent(
        [{ nativeEvent: { contentOffset: { y: scrollAnimatedValue } } }],
        {
          listener: (...args: unknown[]): void =>
            forwardScrollEvent(handleScroll, args),
        },
      );
    });

    // The single derive-per-render: the reducer recomputes the window exactly once per render pass
    // (deriving twice would advance its throttled window two batch steps per frame).
    const metrics = createMemo(() => {
      version();
      reduceList(listState, { kind: 'refresh-metrics' }, inputs());
      return listState.metrics;
    });

    // The shared plan: the spacer extents plus the in-window cell keys. Every geometry decision in it
    // is core's, so a windowing bug is fixed once for all adapters.
    const plan = createMemo((): IListPlan | null => {
      const m = metrics();
      if (m.count === FIRST_INDEX) return null;
      return buildListPlan({
        count: m.count,
        first: m.first,
        last: m.last,
        offsets: m.offsets,
        lengths: m.lengths,
        total: m.total,
        keyFor,
        stickyIndices: stickySet(),
        hasHeader: headerElement !== undefined,
      });
    });

    // forcedStickyCell is prepended to the window cells so BOTH walk through the SAME keyed <For>.
    // Two separate template positions would give a header toggling between "forced ahead of the
    // window" and "inside the window" no shared identity, so it would be destroyed and rebuilt
    // (losing its measured layout, back to its default translateY) on every crossing.
    const cells = createMemo((): readonly IListCellPlan[] => {
      const current = plan();
      if (current === null) return [];
      return current.forcedStickyCell !== undefined
        ? [current.forcedStickyCell, ...current.cells]
        : current.cells;
    });
    // <For> matches by VALUE identity, so the KEYS — not the plan's freshly-built cell objects — are
    // what it walks. A key that survives a window slide keeps its row's nodes and simply moves; over
    // the objects every row would be rebuilt on every recompute.
    const cellKeys = createMemo(() => cells().map(cell => cell.key));
    const cellIndexByKey = createMemo(
      () =>
        new Map<string, number>(
          cells().map((cell): [string, number] => [cell.key, cell.index]),
        ),
    );
    // The after-commit pass, in the order every adapter runs it: batch fill, edge-reached, viewability,
    // initial scroll, MVCP. Each is guarded by its own dedup state inside the reducer, so running it on
    // every windowing change is safe. `on()` runs the body untracked, so this depends on the windowing
    // SIGNATURE alone — the same dedup key every adapter shares — and not on every prop the reducer
    // inputs touch.
    const commitSignature = createMemo(() => {
      metrics();
      return listEffectSignature(listState);
    });
    createEffect(
      on(commitSignature, () => {
        const result = reduceList(listState, { kind: 'commit' }, inputs());
        runEffects(result.effects);
      }),
    );

    // RN's ViewabilityHelper.dispose: a pending dwell timer must not outlive the list.
    onCleanup(() => {
      if (viewableTimer !== null) clearTimeout(viewableTimer);
      if (batchTimer !== null) clearTimeout(batchTimer);
    });

    const isEmpty = (): boolean => metrics().count === FIRST_INDEX;
    const leadingExtent = (): number => plan()?.leadingExtent ?? EMPTY_OFFSET;
    const trailingExtent = (): number => plan()?.trailingExtent ?? EMPTY_OFFSET;
    const spacerStyle = (extent: number): IViewStyle =>
      isHorizontal() ? { width: extent } : { height: extent };

    // Merge an override onto the separator at a given gap. A gap index outside [0, count-2] addresses
    // no separator, so the write is a no-op (RN bails on the same bounds).
    function mergeSeparator(
      gapIndex: number,
      patch: Partial<ISeparatorProps<ItemT>>,
    ): void {
      if (!isSeparatorGapInRange(gapIndex, listState.metrics.count)) return;
      separatorOverrides.set(gapIndex, {
        ...separatorOverrides.get(gapIndex),
        ...patch,
      });
      setSeparatorVersion(tick => tick + 1);
    }

    // The ISeparators handle for the cell at `index` (RN CellRenderer._separators): highlight touches
    // the gap before AND after this cell, so a pressed row draws a full-bleed divider on both sides.
    function makeSeparators(index: number): ISeparators {
      return {
        highlight: (): void => {
          mergeSeparator(index - 1, { highlighted: true });
          mergeSeparator(index, { highlighted: true });
        },
        unhighlight: (): void => {
          mergeSeparator(index - 1, { highlighted: false });
          mergeSeparator(index, { highlighted: false });
        },
        updateProps: (
          select: 'leading' | 'trailing',
          newProps: Record<string, unknown>,
        ): void => {
          mergeSeparator(select === 'leading' ? index - 1 : index, newProps);
        },
      };
    }

    // Reads separatorVersion so a highlight()/unhighlight()/updateProps() call reactively refreshes
    // this gap's props — separatorOverrides is a plain Map and tracks nothing on its own.
    function separatorPropsFor(index: number): ISeparatorProps<ItemT> {
      separatorVersion();
      const overrides = separatorOverrides.get(index);
      return {
        highlighted: overrides?.highlighted === true,
        leadingItem: props.getItem(props.data, index),
        trailingItem: props.getItem(props.data, index + 1),
        ...overrides,
      };
    }

    function separatorElement(index: number): JSX.Element {
      const Separator = props.ItemSeparatorComponent;
      if (Separator === undefined) return undefined;
      // A spread of a CALL compiles to mergeProps(() => …), so the separator's props stay live.
      return <Separator {...separatorPropsFor(index)} />;
    }

    // RN renders a separator in the gap AFTER a cell, and only while there is a following rendered
    // cell — never after the window's last one.
    // RN renders a separator in the gap AFTER a cell, and only while there is a following rendered
    // cell — never after the window's last one, and never after the force-mounted sticky cell, which
    // is not adjacent to the window.
    // RN gates the separator on the last index of the DATA, not of the WINDOW
    // (VirtualizedList.js:793 `const end = getItemCount(data) - 1`), and now that the separator
    // lives INSIDE the measuring wrapper that distinction is load-bearing: gating on the window
    // would make a cell's own measured height change as the window slides past it. Device-measured
    // 2026-08-19 as a run of cells all shifting by exactly the divider's 1px.
    // Nothing about the WINDOW may enter this predicate. The separator lives inside the measuring
    // wrapper, so whatever decides to render it decides the cell's own height — and a height that
    // depends on where the window happens to sit moves the content under the user every time the
    // window slides. Two window-dependent terms were removed after being measured on device
    // 2026-08-19, each as a run of cells shifting by exactly the divider's 1px: gating on the
    // window's `last` (RN gates on the data's, VirtualizedList.js:793), and excluding the
    // force-mounted sticky cell. RN excludes neither — its sticky header keeps its separator like
    // any other cell.
    const hasSeparatorAfter = (index: number): boolean =>
      props.ItemSeparatorComponent !== undefined && index < metrics().count - 1;

    // Records a sticky header's measured y (RN's _headerLayoutYs) so the header AHEAD of it can
    // compute its collision point; without it every header would stick indefinitely.
    function makeStickyCellLayout(
      index: Accessor<number>,
    ): (event: ISymbioteEvent) => void {
      const measure = makeCellMeasure(index);
      return (event: ISymbioteEvent): void => {
        measure(event);
        const y = readLayoutNumber(event, 'y');
        if (y === undefined || headerLayoutYs.get(index()) === y) return;
        dlog(`VirtualizedList sticky header index=${index()} y=${y}`);
        headerLayoutYs.set(index(), y);
        setStickyVersion(tick => tick + 1);
      };
    }

    // Only a header MOUNTED RIGHT NOW can collide with this one — the same restriction React gets by
    // handing its ScrollView the RENDERED sticky positions rather than the full index list. Feeding
    // the full list instead lets a header collide against a stale y from one that already scrolled
    // out, freezing it in place. The map itself is deliberately NOT pruned (React does not either): a
    // measured y stays valid for when that header scrolls back in.
    function nextStickyHeaderYFor(index: number): number | undefined {
      // Read the bump FIRST so this stays a dependency of whichever header calls it — that is what
      // turns "a later header measured" into "the previous header rebuilds its collision range".
      stickyVersion();
      const indices = props.stickyHeaderIndices;
      if (indices === undefined) return undefined;
      const mounted = new Set(cells().map(cell => cell.index));
      const rendered = indices.filter(sticky => mounted.has(sticky));
      return nextStickyHeaderY(
        rendered,
        rendered.indexOf(index),
        headerLayoutYs,
      );
    }

    function buildCell(index: Accessor<number>, sticky: boolean): JSX.Element {
      // Called ONCE and untracked, the shape Solid core uses for its own render props: a tracked call
      // would put the item signals in the cell's `insert` effect and rebuild this whole subtree on
      // every window step (.claude/rules/solid-descriptor-bridge.md §4).
      const content = untrack(() =>
        props.renderItem(() => ({
          item: props.getItem(props.data, index()),
          index: index(),
          separators: makeSeparators(index()),
        })),
      );
      // The separator rides INSIDE the measuring wrapper, where RN's own cell renderer puts it
      // (VirtualizedListCellRenderer.js:218-221). As a SIBLING it is an extra flex child, so the
      // chrome between two cells is gap + separator + gap while a spacer collapsing that region
      // replaces it with one gap — every cell below the leading spacer then lands short by
      // (separator + gap), and the content jumps by that much each time the window's first index
      // moves. Measured at exactly 17px on device 2026-08-19 (a 1px divider under a 16px container
      // gap); see .claude/rules/list-geometry-feedback-loop.md.
      const separator = (
        <Show when={hasSeparatorAfter(index())}>
          <symbiote-view>{separatorElement(index())}</symbiote-view>
        </Show>
      );
      if (!sticky) {
        return (
          <symbiote-view
            onLayout={makeCellMeasure(index)}
            style={invertedStyle()}
          >
            {content}
            {separator}
          </symbiote-view>
        );
      }
      // The sticky wrapper measures the cell itself, so it REPLACES the plain measuring view rather
      // than nesting inside it. Every reactive input is written as a CALL, which makes the compiler
      // emit a getter the header reads inside its OWN effect — a resolved value here would join the
      // enclosing insert effect and rebuild every header on every layout.
      return (
        <ScrollViewStickyHeader
          onLayout={makeStickyCellLayout(index)}
          nextHeaderLayoutY={nextStickyHeaderYFor(index())}
          scrollAnimatedValue={scrollAnimatedValue}
          inverted={undefined}
          scrollViewHeight={undefined}
        >
          {content}
          {separator}
        </ScrollViewStickyHeader>
      );
    }

    function buildRow(key: string): JSX.Element {
      // The row is keyed by its cell key, so its data INDEX moves under it as the window slides. The
      // previous value is the fallback for the tick between a key leaving the plan and <For>
      // disposing its row.
      const index = createMemo(
        (previous: number) => cellIndexByKey().get(key) ?? previous,
        NO_INDEX,
      );
      const isSticky = createMemo(() => stickySet()?.has(index()) === true);
      // A sticky cell is a different host subtree, not a different prop, and Solid has no reconciler
      // to swap one for the other — so the flip is an explicit rebuild boundary keyed on the
      // DISCRIMINATOR alone, with the build untracked by `on()`.
      const cell = createMemo(on(isSticky, sticky => buildCell(index, sticky)));
      const forcedStickyIndex = (): number | undefined =>
        plan()?.forcedStickyCell?.index;
      const gapExtent = (): number => plan()?.gapExtent ?? EMPTY_OFFSET;
      return [
        cell,
        // The gap between the force-mounted sticky cell and the window's first cell.
        <Show
          when={forcedStickyIndex() === index() && gapExtent() > EMPTY_OFFSET}
        >
          <symbiote-view style={spacerStyle(gapExtent())} />
        </Show>,
      ];
    }

    // The scroll host's own intrinsics. A horizontal list resolves DIFFERENT host tags (on Android
    // horizontal scrolling is a separate ViewManager entirely) and lays its content out in a row.
    // A class-name string resolves through the shared registry before it reaches the intrinsic
    // selector, which only understands style objects/arrays.
    const contentContainerStyleInput = ():
      IStyleProp<IViewStyle> | undefined => {
      const style = props.contentContainerStyle;
      return typeof style === 'string' ? resolveClassName(style) : style;
    };
    const intrinsics = createMemo(() =>
      selectScrollIntrinsics(isHorizontal(), contentContainerStyleInput()),
    );

    const wrapsRefreshControl = (): boolean =>
      platform.refreshControlMode === 'wrap' && props.onRefresh !== undefined;
    // Under the Android wrap the class has to be resolved BEFORE the layout/visual split, or a
    // class-only layout prop (flex, height, gap, …) never reaches the wrapper and it collapses to
    // nothing. Same reasoning as ScrollView's.
    const splitStyles = createMemo(() =>
      splitLayoutProps([
        resolveClassName(props.class),
        props.style,
        invertedStyle(),
      ]),
    );

    // withStableKeys because several keys below are conditional and Solid's `spread` walks only the
    // CURRENT key set with no removal pass — a key that vanished would keep its last value on the
    // native view forever (.claude/rules/solid-descriptor-bridge.md §1).
    const outerBag = withStableKeys(() => {
      const bag: Record<string, unknown> = {
        ...resolveAccessibilityProps(accessibilityRest),
        // Base style UNDER the user style, so an explicit height / flexDirection still wins. Under
        // the Android wrap only the VISUAL half stays here; the LAYOUT half moved to the wrapper.
        style: wrapsRefreshControl()
          ? [intrinsics().scrollViewBaseStyle, splitStyles().inner]
          : [intrinsics().scrollViewBaseStyle, props.style, invertedStyle()],
        // Load-bearing on iOS (it flips RCTScrollView's own axis); ignored by Android's dedicated
        // horizontal manager.
        horizontal: isHorizontal(),
        // RN's ScrollView default (`nestedScrollEnabled ?? true`): Android needs it for a list nested
        // inside another scrollable to scroll at all, and the Android RefreshControl wrap needs the
        // inner scroll to take the gesture before the refresh parent.
        nestedScrollEnabled: true,
        onLayout: onViewportLayout,
        onScroll: scrollHandler(),
      };
      // forwarding's throttle, not the raw prop: it folds in the sticky-mode default (1 native / 16
      // JS-fallback), without which a header rebuilt off too-sparse scroll events pins late.
      if (forwarding().scrollEventThrottle !== undefined)
        bag.scrollEventThrottle = forwarding().scrollEventThrottle;
      // Stripped under the wrap: splitStyles already folded the resolved class into outer/inner, so
      // forwarding it raw too would re-apply its LAYOUT half a second time.
      if (!wrapsRefreshControl()) bag.class = props.class;
      if (props.onScrollBeginDrag !== undefined)
        bag.onScrollBeginDrag = props.onScrollBeginDrag;
      if (props.onScrollEndDrag !== undefined)
        bag.onScrollEndDrag = props.onScrollEndDrag;
      if (props.onMomentumScrollBegin !== undefined)
        bag.onMomentumScrollBegin = props.onMomentumScrollBegin;
      if (props.onMomentumScrollEnd !== undefined)
        bag.onMomentumScrollEnd = props.onMomentumScrollEnd;
      if (props.keyboardShouldPersistTaps !== undefined)
        bag.keyboardShouldPersistTaps = props.keyboardShouldPersistTaps;
      if (props.keyboardDismissMode !== undefined)
        bag.keyboardDismissMode = props.keyboardDismissMode;
      // Forwarded so native anchors the cells it CAN see; the JS half (the prepended items collapsed
      // into the leading spacer) is the reducer's. minIndexForVisible counts CHILDREN, so it is
      // bumped by one when a ListHeaderComponent occupies child 0.
      const commanded = commandedOffset();
      if (commanded !== undefined) bag.contentOffset = commanded;
      const mvcp = props.maintainVisibleContentPosition;
      if (mvcp !== undefined) {
        bag.maintainVisibleContentPosition = {
          ...mvcp,
          minIndexForVisible:
            mvcp.minIndexForVisible +
            (headerElement !== undefined ? HEADER_CHILD_COUNT : FIRST_INDEX),
        };
      }
      return bag;
    });

    // `collapsable: false` keeps the content container a real Yoga node: Android Fabric would otherwise
    // flatten it away and hoist the cells up as DIRECT children of the scroll view, which hosts exactly
    // one. A horizontal list also pins the container to the full content WIDTH, or the row is stretched
    // to the viewport and there is nothing to scroll.
    const contentBag = withStableKeys(() => {
      const bag: Record<string, unknown> = {
        style: isHorizontal()
          ? [intrinsics().contentStyle, { width: metrics().total }]
          : intrinsics().contentStyle,
        collapsable: false,
      };
      // maintainVisibleContentPosition anchors against the metrics of MOUNTED cell views, and Android
      // Fabric flattens layout-only cells away — so the native helper would have nothing to anchor to
      // and the list jumps on prepend. RN keeps the cells real the same way. iOS never flattens.
      if (props.maintainVisibleContentPosition !== undefined)
        bag.collapsableChildren = false;
      return bag;
    });

    // Every reactive read below sits inside a <Show>/<For> prop getter, so this accessor itself has no
    // dependencies and the content view's `insert` effect runs exactly ONCE. Moving one of those
    // conditions into a plain helper called from here would put it in that effect's dependency set and
    // rebuild the whole list on the next scroll (.claude/rules/solid-descriptor-bridge.md §4).
    function listBody(): JSX.Element {
      return [
        <Show when={headerElement !== undefined}>
          <symbiote-view>{headerElement}</symbiote-view>
        </Show>,
        <Show
          when={isEmpty()}
          fallback={
            <>
              <Show when={leadingExtent() > EMPTY_OFFSET}>
                <symbiote-view style={spacerStyle(leadingExtent())} />
              </Show>
              <For each={cellKeys()}>{buildRow}</For>
              <Show when={trailingExtent() > EMPTY_OFFSET}>
                <symbiote-view style={spacerStyle(trailingExtent())} />
              </Show>
            </>
          }
        >
          <Show when={emptyElement !== undefined}>
            <symbiote-view>{emptyElement}</symbiote-view>
          </Show>
        </Show>,
        <Show when={footerElement !== undefined}>
          <symbiote-view>{footerElement}</symbiote-view>
        </Show>,
      ];
    }

    function hostElement(tag: ISymbioteIntrinsic): ISymbioteNode {
      const node = createElement(tag);
      // Narrowing, not defensive: the renderer types createElement over its IHostNode union (which
      // includes the surface), while everything below needs a real host node.
      if (!isSymbioteNode(node))
        throw new Error(`VirtualizedList: ${tag} did not create a host node`);
      return node;
    }

    // Built ONCE per tree: `refreshing` is written as a CALL, so the compiler emits a getter and the
    // controlled state keeps reaching this same node.
    function buildRefreshControl(): ISymbioteNode | undefined {
      const onRefresh = props.onRefresh;
      if (onRefresh === undefined) return undefined;
      dlog('VirtualizedList wiring RefreshControl (onRefresh provided)');
      const element = (
        <RefreshControl
          refreshing={props.refreshing ?? false}
          onRefresh={onRefresh}
          progressViewOffset={props.progressViewOffset}
        />
      );
      return isSymbioteNode(element) ? element : undefined;
    }

    // The nested scroll-view / content-view pair RN's ScrollView commits.
    function buildTree(): ISymbioteNode {
      const { scrollViewIntrinsic, contentIntrinsic } = intrinsics();
      dlog(`VirtualizedList -> ${scrollViewIntrinsic}`);

      const content = hostElement(contentIntrinsic);
      spread(content, contentBag, true);
      insert(content, listBody);

      const scroll = hostElement(scrollViewIntrinsic);
      hostNode = scroll;
      spread(scroll, outerBag, true);

      // iOS: the RefreshControl is a childless SIBLING placed BEFORE the content container (RN
      // ScrollView.js: {refreshControl}{contentContainer}).
      const refresh = buildRefreshControl();
      if (refresh !== undefined && platform.refreshControlMode === 'sibling') {
        insertNode(scroll, refresh);
      }
      insertNode(scroll, content);
      if (refresh === undefined || !wrapsRefreshControl()) return scroll;

      // Android: the RefreshControl WRAPS the scroll host. React does this with cloneElement and Vue
      // by re-invoking the VNode's type; Solid has neither, because the element arrived already
      // built — so the scroll host is nested into the existing node and the outer (layout) half of
      // the style is written onto it. A render effect, not a one-shot set, so a later style change
      // still moves.
      createRenderEffect(() => {
        setProp(refresh, 'style', splitStyles().outer);
      });
      insertNode(refresh, scroll);
      return refresh;
    }

    // Drive the sticky scroll value on the native UI thread (RN's attachNativeEvent) so the header
    // interpolations ride scroll natively with no JS per frame. `tree()` is read for its dependency:
    // a rebuild means a NEW scroll node to attach to. The engine commits on a microtask, so the node
    // has no Fabric tag on the first run and the attach would no-op with no retry — whenCommitted is
    // that retry.
    function attachSticky(): void {
      createEffect(() => {
        tree();
        if (!nativeStickyAvailable()) return;
        const node = hostNode;
        if (node === null) return;
        let detach: (() => void) | undefined;
        const cancel = whenCommitted(node, () => {
          detach = attachStickyScroll(node, scrollAnimatedValue);
        });
        onCleanup(() => {
          cancel();
          detach?.();
        });
      });
    }

    // The scroll AXIS picks a different host TAG and Solid cannot swap a tag under a live node, so the
    // flip REBUILDS — which is exactly what React does when an element type changes. `on()` runs
    // buildTree untracked, so every other read inside it re-props the SAME nodes through `spread`
    // instead of rebuilding them.
    const treeShape = createMemo(() => String(isHorizontal()));
    const tree = createMemo(on(treeShape, () => buildTree()));
    attachSticky();
    return tree;
  };
}
