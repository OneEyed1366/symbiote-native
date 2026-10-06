// VirtualizedList, the Vue lifecycle half over the shared `reduceList` machine
// A generic setup keeps the five emits typed by `ItemT`, raw native scroll events ride `$attrs`
// `listState` is a plain object, a `version` ref is bumped when a transition changes render state

import {
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
  type VNode,
} from '@vue/runtime-core';
import {
  EMPTY_OFFSET,
  LIST_ACTION_KIND,
  buildListHandle,
  buildListReducerInputs,
  buildScrollViewHandle,
  buildSeparatorHandles,
  buildViewabilityPairs,
  clearTimers,
  createInitialListState,
  createListHandlers,
  createListNesting,
  isSeparatorGapInRange,
  listEffectSignature,
  listHasMore,
  reduceList,
  resolveItemKey,
  runListEffects,
  scrollTargetOf,
  viewPropsOf,
  type IEffectHost,
  type IListAction,
  type IListHandlers,
  type IListNesting,
  type IListState,
  type ISeparatorProps,
  type ISeparators,
  type ITimerSlot,
} from '@symbiote-native/components';
import {
  dlog,
  isDebug,
  isSymbioteNode,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import type { ICtx } from '../../utils/component-helpers';
import { buildListChildren } from './list-children';
import { buildScrollProps } from './list-scroll-props';
import { narrowProps } from './narrow-props';
import {
  provideVirtualizedListScope,
  useVirtualizedListScope,
} from './nested-scope';
import { userHandlersOf } from './user-handlers';
import {
  EMIT_KEYS,
  PROP_KEYS,
  type IVirtualizedListEmits,
  type IVirtualizedListProps,
  type IVirtualizedListSlots,
} from './virtualized-list-props';

// Shared list types stay importable from here, flat-list and the section list read them this way
export type {
  ICellLayout,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IVirtualizedListHandle,
} from '@symbiote-native/components';
export type {
  IVirtualizedListEmits,
  IVirtualizedListProps,
  IVirtualizedListSlots,
} from './virtualized-list-props';

export const VirtualizedList = defineComponent(
  <ItemT>(
    props: IVirtualizedListProps<ItemT>,
    {
      attrs,
      expose,
      emit,
      slots,
    }: ICtx<IVirtualizedListEmits<ItemT>, IVirtualizedListSlots<ItemT>>,
  ) => {
    const version = ref(EMPTY_OFFSET);
    const separatorVersion = ref(EMPTY_OFFSET);
    // A fresh object each push so the commit path re-applies a repeated value
    const commandedOffset = ref<{ x: number; y: number } | undefined>(
      undefined,
    );

    // `<scroll-view>` is a tag, so its `ref` hands back the raw engine node, held by identity
    const scrollNodeRef = shallowRef<ISymbioteNode | null>(null);
    const setScrollNodeRef = (el: unknown): void => {
      scrollNodeRef.value = isSymbioteNode(el) ? el : null;
    };
    const scrollHandle = buildScrollViewHandle(() => scrollNodeRef.value);

    // The parent's own vnode props tell whether it listens, Vue strips emits from `$attrs`
    const instance = getCurrentInstance();
    const listens = (onName: string): boolean => {
      const vnodeProps = instance?.vnode.props;
      return vnodeProps != null && typeof vnodeProps[onName] === 'function';
    };

    const listState: IListState<ItemT> = createInitialListState<ItemT>();
    const separatorOverrides = new Map<
      number,
      Partial<ISeparatorProps<unknown>>
    >();
    const viewableTimer: ITimerSlot = { current: null };
    const batchTimer: ITimerSlot = { current: null };

    const narrowed = computed(() =>
      narrowProps<ItemT>({ props, attrs, slots, emit, listens }),
    );
    const viewabilityPairs = computed(() =>
      buildViewabilityPairs(
        narrowed.value.onViewableItemsChanged,
        narrowed.value.viewabilityConfig,
        narrowed.value.viewabilityConfigCallbackPairs,
      ),
    );
    const buildInputs = () =>
      buildListReducerInputs(
        {
          ...narrowed.value,
          findFirstChildWithMore: (first, last) =>
            nesting.findFirstChildWithMore(first, last),
        },
        viewabilityPairs.value,
      );

    const keyFor = (index: number): string => {
      const p = narrowed.value;
      return resolveItemKey(p.getItem(p.data, index), index, p.keyExtractor);
    };

    const scrollToPixel = (offset: number, animated: boolean): void => {
      const target = scrollTargetOf(offset, narrowed.value.horizontal);
      if (scrollNodeRef.value === null) {
        dlog(`Vue VirtualizedList scrollTo offset=${offset} pending-ref`);
        commandedOffset.value = target;
        return;
      }
      dlog(
        `Vue VirtualizedList scrollTo offset=${offset} animated=${animated}`,
      );
      scrollHandle.scrollTo({ x: target.x, y: target.y, animated });
    };

    const effectHost: IEffectHost<ItemT> = {
      callbacks: () => ({
        onEndReached: narrowed.value.onEndReached,
        onStartReached: narrowed.value.onStartReached,
        onScrollToIndexFailed: narrowed.value.onScrollToIndexFailed,
        viewabilityPairs: viewabilityPairs.value,
      }),
      scrollToPixel,
      dispatch: () => dispatch,
      viewableTimer,
      batchTimer,
    };

    const dispatch = (action: IListAction<ItemT>): void => {
      const result = reduceList(listState, action, buildInputs());
      runListEffects(result.effects, effectHost);
      if (result.changed) version.value += 1;
    };

    // The one window recompute, cached so the render and the commit signature both read it
    // without re-deriving (which would double-advance the throttle)
    const metrics = computed(() => {
      void version.value;
      reduceList(
        listState,
        { kind: LIST_ACTION_KIND.refreshMetrics },
        buildInputs(),
      );
      return listState.metrics;
    });

    const commitSignature = computed(() => {
      void metrics.value;
      return listEffectSignature(listState);
    });

    // The list above hands its scope down, this list hands its own to the lists in its cells
    const nesting: IListNesting<ItemT> = createListNesting<ItemT>({
      parent: useVirtualizedListScope(),
      horizontal: narrowed.value.horizontal,
      getState: () => listState,
      dispatch,
      getContainerNode: () => scrollNodeRef.value,
      getHasMore: () => listHasMore(listState),
      keyFor,
      handlers: () => handlers,
    });
    provideVirtualizedListScope(nesting.scope);

    const handlers: IListHandlers = createListHandlers<ItemT>({
      isHorizontal: () => narrowed.value.horizontal,
      user: () => userHandlersOf(narrowed.value),
      nesting: () => nesting,
      dispatch,
      clearCommandedOffset: () => {
        commandedOffset.value = undefined;
      },
      getNode: () => scrollNodeRef.value,
      keyFor,
    });

    const makeCellFocus = (index: number) => (): void =>
      dispatch({ kind: LIST_ACTION_KIND.cellFocused, index });

    const mergeSeparator = (
      gapIndex: number,
      patch: Partial<ISeparatorProps<unknown>>,
    ): void => {
      if (!isSeparatorGapInRange(gapIndex, listState.metrics.count)) return;
      separatorOverrides.set(gapIndex, {
        ...separatorOverrides.get(gapIndex),
        ...patch,
      });
      separatorVersion.value += 1;
    };

    const makeSeparators = (index: number): ISeparators =>
      buildSeparatorHandles(index, mergeSeparator);

    expose(
      buildListHandle({
        dispatch,
        scrollHandle,
        getNode: () => scrollNodeRef.value,
      }),
    );

    // The after-commit pass, a post-flush watcher on the windowing signature
    watch(
      commitSignature,
      () => {
        const result = reduceList(
          listState,
          { kind: LIST_ACTION_KIND.commit },
          buildInputs(),
        );
        runListEffects(result.effects, effectHost);
      },
      { flush: 'post' },
    );

    onBeforeUnmount(() => {
      clearTimers([viewableTimer, batchTimer]);
      nesting.detach();
    });

    return () => {
      const p = narrowed.value;
      const m = metrics.value;
      // Reading the version makes a separator bump re-render
      void separatorVersion.value;

      if (p.renderItem === undefined) {
        dlog('Vue VirtualizedList: no #item slot provided, cells render empty');
      }
      if (isDebug()) {
        dlog(
          `Vue VirtualizedList window [${m.first}, ${m.last}] of ${m.count} ` +
            `(offset=${listState.scrollOffset}, viewport=${listState.viewportLength})`,
        );
      }

      const { children, hasHeader } = buildListChildren({
        props: p,
        metrics: m,
        keyFor,
        separatorOverrides,
        makeSeparators,
        makeCellMeasure: handlers.makeCellMeasure,
        makeCellFocus,
      });
      const scrollProps = buildScrollProps({
        props: p,
        total: m.total,
        hasHeader,
        onScroll: handlers.onScroll,
        onScrollBeginDrag: handlers.onScrollBeginDrag,
        onScrollEndDrag: handlers.onScrollEndDrag,
        onMomentumScrollBegin: handlers.onMomentumScrollBegin,
        onMomentumScrollEnd: handlers.onMomentumScrollEnd,
        onContentSizeChange: handlers.onContentSizeChange,
        onLayout: handlers.onViewportLayout,
        setRef: setScrollNodeRef,
        commandedOffset: commandedOffset.value,
      });
      // The list above scrolls, so RN renders a `View` with no content container
      if (nesting.isNested) {
        return h(
          'view',
          {
            ...viewPropsOf(p.forwarded),
            style: p.style,
            onLayout: handlers.onViewportLayout,
            ref: setScrollNodeRef,
          },
          children,
        );
      }
      // With a `@refresh` listener the RefreshControl is an ordinary first child, the scroll
      // behavior claims it and places it per platform
      const refreshControl: VNode[] =
        p.onRefresh === undefined
          ? []
          : [
              h('refresh-control', {
                refreshing: p.refreshing,
                onRefresh: p.onRefresh,
                progressViewOffset: p.progressViewOffset,
              }),
            ];

      // The scroll TAG, not a wrapper: the engine builds the content node and places the control
      return h(
        p.horizontal ? 'horizontal-scroll-view' : 'scroll-view',
        scrollProps,
        [...refreshControl, ...children],
      );
    };
  },
  {
    name: 'VirtualizedList',
    inheritAttrs: false,
    props: PROP_KEYS,
    emits: EMIT_KEYS,
  } as unknown as undefined,
);
