// How one list finds the lists nested in its cells and shares one scroll with them
// RN carries this in `VirtualizedListContext` and a `ChildListCollection`; the rules live here once
// and an adapter only hands the scope down through its own context mechanism

import {
  measureLayout,
  parentOf,
  type IMeasureLayoutOnSuccess,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { EMPTY_OFFSET } from './list-constants';
import { readScrollOffset, readViewportLength } from './list-metrics';
import type { IListAction, IListState } from './list-reducer-types';
import { createChildRegistry, type IChildRegistry } from './nested-scope';

const NO_ELAPSED = 1;
const NO_ZOOM = 1;

// The scroll a parent reports to the lists nested in it
export type IScopeMetrics = {
  contentLength: number;
  dOffset: number;
  dt: number;
  offset: number;
  timestamp: number;
  velocity: number;
  visibleLength: number;
  zoomScale: number;
};

type IScrollHandler = (event: ISymbioteEvent) => void;

// The adapter's own handlers, the ones a parent calls on every list nested in it
export type INestedHandlers = {
  onScroll: IScrollHandler;
  onScrollBeginDrag: IScrollHandler;
  onScrollEndDrag: IScrollHandler;
  onMomentumScrollBegin: IScrollHandler;
  onMomentumScrollEnd: IScrollHandler;
  recordInteraction: () => void;
};

// What a nested list shows its parent
export type INestedChild = INestedHandlers & {
  hasMore: () => boolean;
  measureLayoutRelativeToContainingList: () => void;
};

export type IOutermostList = {
  getContainerNode: () => ISymbioteNode | null;
};

// RN's `VirtualizedListContext`. Its `cellKey` is not here: a provider per cell costs a component
// per cell in every list, so `cellKeyOf` resolves the cell from the nested list's own node instead
export type IListScope = {
  horizontal: boolean;
  getScrollMetrics: () => IScopeMetrics;
  getOutermostParentListRef: () => IOutermostList;
  registerAsNestedChild: (child: {
    cellKey: string;
    ref: INestedChild;
  }) => void;
  unregisterAsNestedChild: (child: { ref: INestedChild }) => void;
  registerCellNode: (node: ISymbioteNode, cellKey: string) => void;
  cellKeyOf: (node: ISymbioteNode) => string | undefined;
  // A nested list mounted before its cell was laid out asks again once any cell is known
  retryWhenCellKnown: (retry: () => boolean) => void;
};

export type INestingConfig<ItemT = unknown> = {
  parent: IListScope | null;
  horizontal: boolean;
  getState: () => IListState<ItemT>;
  dispatch: (action: IListAction<ItemT>) => void;
  // The host node this list renders: its scroll view, or the plain view when it is nested
  getContainerNode: () => ISymbioteNode | null;
  getHasMore: () => boolean;
  keyFor: (index: number) => string;
  handlers: () => INestedHandlers;
  measure?: (
    node: ISymbioteNode,
    relativeTo: ISymbioteNode,
    onSuccess: IMeasureLayoutOnSuccess,
  ) => void;
};

export type IListNesting<ItemT = unknown> = {
  isNested: boolean;
  scope: IListScope;
  child: INestedChild;
  findFirstChildWithMore: (first: number, last: number) => number | null;
  fanOut: INestedHandlers;
  // A cell was laid out again, so the lists in it moved and measure where they sit anew
  remeasureCell: (cellKey: string) => void;
  parentScrollAction: (
    event: ISymbioteEvent,
    timestamp: number,
  ) => IListAction<ItemT> | undefined;
  attach: (cellKey: string) => void;
  // True once this list sits in a cell of its parent, false while that cell is still unknown
  attachAt: (node: ISymbioteNode) => boolean;
  detach: () => void;
};

function metricsOf<ItemT>(
  state: IListState<ItemT>,
  isNested: boolean,
): IScopeMetrics {
  return {
    contentLength: isNested ? state.nestedContentLength : state.metrics.total,
    dOffset: state.scrollVelocity,
    dt: NO_ELAPSED,
    offset: state.scrollOffset,
    timestamp: state.scrollTimestamp ?? EMPTY_OFFSET,
    velocity: state.scrollVelocity,
    visibleLength: state.viewportLength,
    zoomScale: NO_ZOOM,
  };
}

// The cell of the parent a nested list's node sits in, found once when the list mounts
function cellKeyAbove(
  scope: IListScope,
  node: ISymbioteNode,
): string | undefined {
  for (
    let ancestor = parentOf(node);
    ancestor !== undefined;
    ancestor = parentOf(ancestor)
  ) {
    const cellKey = scope.cellKeyOf(ancestor);
    if (cellKey !== undefined) return cellKey;
  }
  return undefined;
}

// The parent's events, handed on to every list nested in it
function fanOutOver(children: IChildRegistry<INestedChild>): INestedHandlers {
  return {
    onScroll: event => children.forEach(list => list.onScroll(event)),
    onScrollBeginDrag: event =>
      children.forEach(list => list.onScrollBeginDrag(event)),
    onScrollEndDrag: event =>
      children.forEach(list => list.onScrollEndDrag(event)),
    onMomentumScrollBegin: event =>
      children.forEach(list => list.onMomentumScrollBegin(event)),
    onMomentumScrollEnd: event =>
      children.forEach(list => list.onMomentumScrollEnd(event)),
    recordInteraction: () => children.forEach(list => list.recordInteraction()),
  };
}

type IScopeParts<ItemT> = {
  config: INestingConfig<ItemT>;
  isNested: boolean;
  children: IChildRegistry<INestedChild>;
};

function createScope<ItemT>(parts: IScopeParts<ItemT>): IListScope {
  const { config, isNested, children } = parts;
  const cells = new WeakMap<ISymbioteNode, string>();
  const retries = new Set<() => boolean>();
  const self: IOutermostList = { getContainerNode: config.getContainerNode };
  return {
    horizontal: config.horizontal,
    getScrollMetrics: () => metricsOf(config.getState(), isNested),
    getOutermostParentListRef: () =>
      isNested && config.parent !== null
        ? config.parent.getOutermostParentListRef()
        : self,
    registerAsNestedChild: ({ cellKey, ref }) => {
      children.add(ref, cellKey);
      if (config.getState().hasInteracted) ref.recordInteraction();
    },
    unregisterAsNestedChild: ({ ref }) => children.remove(ref),
    registerCellNode: (node, cellKey) => {
      cells.set(node, cellKey);
      for (const retry of retries) {
        if (retry()) retries.delete(retry);
      }
    },
    cellKeyOf: node => cells.get(node),
    retryWhenCellKnown: retry => retries.add(retry),
  };
}

// Where this list sits in the outermost list, then the parent scroll as it stands now
// A moved viewport or offset sends the lists nested in this one to measure again
function measureRelativeToContainingList<ItemT>(
  parts: IScopeParts<ItemT>,
): () => void {
  const { config, children } = parts;
  const { parent, horizontal } = config;
  const measure = config.measure ?? measureLayout;
  return () => {
    const own = config.getContainerNode();
    const outermost = parent?.getOutermostParentListRef().getContainerNode();
    if (parent === null || own === null || !outermost) return;
    measure(own, outermost, (x, y, width, height) => {
      const state = config.getState();
      const before = [state.scrollOffset, state.viewportLength];
      config.dispatch({
        kind: 'parent-layout',
        offsetFromParent: horizontal ? x : y,
        contentLength: horizontal ? width : height,
      });
      const metrics = parent.getScrollMetrics();
      config.dispatch({
        kind: 'parent-scroll',
        offset: metrics.offset,
        visibleLength: metrics.visibleLength,
        timestamp: metrics.timestamp,
      });
      const isMoved =
        state.scrollOffset !== before[0] || state.viewportLength !== before[1];
      if (isMoved) {
        children.forEach(list => list.measureLayoutRelativeToContainingList());
      }
    });
  };
}

function createChild<ItemT>(
  config: INestingConfig<ItemT>,
  measureSelf: () => void,
): INestedChild {
  return {
    onScroll: event => config.handlers().onScroll(event),
    onScrollBeginDrag: event => config.handlers().onScrollBeginDrag(event),
    onScrollEndDrag: event => config.handlers().onScrollEndDrag(event),
    onMomentumScrollBegin: event =>
      config.handlers().onMomentumScrollBegin(event),
    onMomentumScrollEnd: event => config.handlers().onMomentumScrollEnd(event),
    recordInteraction: () => config.handlers().recordInteraction(),
    hasMore: config.getHasMore,
    measureLayoutRelativeToContainingList: measureSelf,
  };
}

export function createListNesting<ItemT>(
  config: INestingConfig<ItemT>,
): IListNesting<ItemT> {
  const { parent, horizontal } = config;
  const children = createChildRegistry<INestedChild>();
  const isNested = parent !== null && parent.horizontal === horizontal;
  const parts: IScopeParts<ItemT> = { config, isNested, children };
  const child = createChild(config, measureRelativeToContainingList(parts));

  let isAttached = false;
  let isWaiting = false;
  // A list that unmounted while waiting must not join its parent afterwards
  let isGone = false;
  const attach = (cellKey: string): void => {
    if (!isNested || isAttached) return;
    parent.registerAsNestedChild({ cellKey, ref: child });
    isAttached = true;
  };
  const attachAt = (node: ISymbioteNode): boolean => {
    if (isGone) return true;
    if (!isNested || isAttached) return isAttached;
    const cellKey = cellKeyAbove(parent, node);
    if (cellKey !== undefined) {
      attach(cellKey);
      return true;
    }
    if (!isWaiting) {
      isWaiting = true;
      parent.retryWhenCellKnown(() => attachAt(node));
    }
    return false;
  };

  return {
    isNested,
    scope: createScope(parts),
    child,
    findFirstChildWithMore: (first, last) => {
      // Most lists hold no nested list, so a key is never built for them
      if (children.size() === 0) return null;
      for (let index = first; index <= last; index += 1) {
        const key = config.keyFor(index);
        if (children.anyInCell(key, list => list.hasMore())) return index;
      }
      return null;
    },
    fanOut: fanOutOver(children),
    remeasureCell: cellKey =>
      children.forEachInCell(cellKey, list =>
        list.measureLayoutRelativeToContainingList(),
      ),
    parentScrollAction: (event, timestamp) => {
      const offset = readScrollOffset(event, horizontal);
      const visibleLength = readViewportLength(event, horizontal);
      if (offset === undefined || visibleLength === undefined) return undefined;
      return { kind: 'parent-scroll', offset, visibleLength, timestamp };
    },
    attach,
    attachAt,
    detach: () => {
      if (isNested && isAttached)
        parent.unregisterAsNestedChild({ ref: child });
      isAttached = false;
      isGone = true;
    },
  };
}
