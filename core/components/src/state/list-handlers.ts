// Native scroll, drag and layout events turned into reducer actions, and handed on to nested lists
// Written once so an adapter only says where the app's own listeners and its state live

import type { ISymbioteEvent, ISymbioteNode } from '@symbiote-native/engine';
import { LIST_ACTION_KIND } from './list-kinds';
import {
  contentSizeActionOf,
  layoutActionOf,
  measureActionOf,
  scrollActionOf,
} from './list-events';
import type { IListNesting, INestedHandlers } from './list-nesting';
import type { IListAction } from './list-reducer-types';
import type { IContentSizeHandler } from './list-types';

type IScrollHandler = (event: ISymbioteEvent) => void;

// The app's own listeners, each optional
export type IUserScrollHandlers = {
  onScroll?: IScrollHandler;
  onScrollBeginDrag?: IScrollHandler;
  onScrollEndDrag?: IScrollHandler;
  onMomentumScrollBegin?: IScrollHandler;
  onMomentumScrollEnd?: IScrollHandler;
  onContentSizeChange?: IContentSizeHandler;
};

export type IListHandlers = INestedHandlers & {
  onViewportLayout: IScrollHandler;
  makeCellMeasure: (index: number) => IScrollHandler;
  onContentSizeChange: IContentSizeHandler;
};

// Every read is a getter, so a prop that changes after setup is seen by the next event
export type IListHandlerDeps<ItemT> = {
  isHorizontal: () => boolean;
  user: () => IUserScrollHandlers;
  nesting: () => IListNesting<ItemT>;
  dispatch: (action: IListAction<ItemT>) => void;
  clearCommandedOffset: () => void;
  getNode: () => ISymbioteNode | null;
  keyFor: (index: number) => string;
};

// Each one reaches the lists nested in this one first, then the app's own handler
function dragHandlersOf<ItemT>(
  deps: IListHandlerDeps<ItemT>,
): Omit<INestedHandlers, 'onScroll'> {
  const { dispatch, user, nesting } = deps;
  return {
    recordInteraction: () => {
      nesting().fanOut.recordInteraction();
      dispatch({ kind: LIST_ACTION_KIND.recordInteraction });
    },
    onScrollBeginDrag: event => {
      nesting().fanOut.onScrollBeginDrag(event);
      dispatch({ kind: LIST_ACTION_KIND.recordInteraction });
      user().onScrollBeginDrag?.(event);
    },
    onScrollEndDrag: event => {
      nesting().fanOut.onScrollEndDrag(event);
      user().onScrollEndDrag?.(event);
    },
    onMomentumScrollBegin: event => {
      nesting().fanOut.onMomentumScrollBegin(event);
      user().onMomentumScrollBegin?.(event);
    },
    onMomentumScrollEnd: event => {
      nesting().fanOut.onMomentumScrollEnd(event);
      user().onMomentumScrollEnd?.(event);
    },
  };
}

// A nested list's viewport is the parent's, so its own scroll events carry nothing it can use
function scrollHandlerOf<ItemT>(deps: IListHandlerDeps<ItemT>): IScrollHandler {
  return event => {
    const nesting = deps.nesting();
    nesting.fanOut.onScroll(event);
    const timestamp = performance.now();
    const action = nesting.isNested
      ? nesting.parentScrollAction(event, timestamp)
      : scrollActionOf<ItemT>(event, deps.isHorizontal(), timestamp);
    if (action === undefined) return;
    // A real native scroll supersedes any pending commanded offset
    deps.clearCommandedOffset();
    deps.dispatch(action);
    // Compose, don't clobber: the windowing ran first, now the user's handler
    deps.user().onScroll?.(event);
  };
}

function layoutHandlersOf<ItemT>(
  deps: IListHandlerDeps<ItemT>,
): Pick<
  IListHandlers,
  'onViewportLayout' | 'makeCellMeasure' | 'onContentSizeChange'
> {
  return {
    // RN's `_onContentSizeChange`: the list learns its content length, then the app's own handler
    onContentSizeChange: (width, height) => {
      deps.dispatch(
        contentSizeActionOf<ItemT>(width, height, deps.isHorizontal()),
      );
      deps.user().onContentSizeChange?.(width, height);
    },
    onViewportLayout: event => {
      const nesting = deps.nesting();
      if (nesting.isNested) {
        const node = deps.getNode();
        if (node !== null) nesting.attachAt(node);
        nesting.child.measureLayoutRelativeToContainingList();
        return;
      }
      const action = layoutActionOf<ItemT>(event, deps.isHorizontal());
      if (action !== undefined) deps.dispatch(action);
    },
    makeCellMeasure: index => event => {
      const nesting = deps.nesting();
      const action = measureActionOf<ItemT>(event, index, deps.isHorizontal());
      if (action !== undefined) deps.dispatch(action);
      const cellKey = deps.keyFor(index);
      nesting.scope.registerCellNode(event.currentTarget, cellKey);
      nesting.remeasureCell(cellKey);
    },
  };
}

export function createListHandlers<ItemT>(
  deps: IListHandlerDeps<ItemT>,
): IListHandlers {
  return {
    onScroll: scrollHandlerOf(deps),
    ...dragHandlersOf(deps),
    ...layoutHandlersOf(deps),
  };
}
