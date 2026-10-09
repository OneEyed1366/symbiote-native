// How nested lists find each other and keep one scroll between them (RN's `VirtualizedListContext`)
import {
  appendChild,
  createElement,
  createSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installRecordingFabric } from '../../../test-utils/src/index';
import { describe, expect, it } from 'vitest';
import { createListNesting, type IListNesting } from './list-nesting';
import { createInitialListState } from './list-derive';
import type { IListAction, IListState } from './list-reducer-types';

const ROOT_TAG = 880;
const PARENT_VIEWPORT = 400;
const OFFSET_IN_PARENT = 300;
const CONTENT = 5_000;

type IHarness = {
  nesting: IListNesting;
  state: IListState<unknown>;
  dispatched: IListAction<unknown>[];
  received: string[];
  node: ISymbioteNode;
};

function listIn(
  parent: IListNesting | null,
  horizontal = false,
  hasMore = true,
): IHarness {
  const state = createInitialListState<unknown>();
  state.scrollOffset = 120;
  state.viewportLength = PARENT_VIEWPORT;
  const dispatched: IListAction<unknown>[] = [];
  const received: string[] = [];
  const node = createElement('RCTView', false);
  const nesting = createListNesting({
    parent: parent?.scope ?? null,
    horizontal,
    getState: () => state,
    dispatch: action => dispatched.push(action),
    getContainerNode: () => node,
    getHasMore: () => hasMore,
    keyFor: index => `cell-${index}`,
    handlers: () => ({
      onScroll: () => received.push('scroll'),
      onScrollBeginDrag: () => received.push('begin-drag'),
      onScrollEndDrag: () => received.push('end-drag'),
      onMomentumScrollBegin: () => received.push('momentum-begin'),
      onMomentumScrollEnd: () => received.push('momentum-end'),
      recordInteraction: () => received.push('interaction'),
    }),
    measure: (_node, _relativeTo, onSuccess) =>
      onSuccess(0, OFFSET_IN_PARENT, 320, CONTENT),
  });
  return { nesting, state, dispatched, received, node };
}

describe('which lists count as nested', () => {
  it('is nested only under a list with the same orientation', () => {
    const parent = listIn(null);

    expect(listIn(parent.nesting).nesting.isNested).toBe(true);
    expect(listIn(parent.nesting, true).nesting.isNested).toBe(false);
    expect(parent.nesting.isNested).toBe(false);
  });

  it('hands a nested list the outermost list, a root list is its own', () => {
    const root = listIn(null);
    const middle = listIn(root.nesting);
    const inner = listIn(middle.nesting);

    expect(inner.nesting.scope.getOutermostParentListRef()).toBe(
      root.nesting.scope.getOutermostParentListRef(),
    );
    expect(
      root.nesting.scope.getOutermostParentListRef().getContainerNode(),
    ).toBe(root.node);
  });
});

describe('a parent and its nested lists', () => {
  it('holds the window at the first cell whose child list has more', () => {
    const parent = listIn(null);
    const done = listIn(parent.nesting, false, false);
    const busy = listIn(parent.nesting, false, true);
    done.nesting.attach('cell-2');
    busy.nesting.attach('cell-4');

    expect(parent.nesting.findFirstChildWithMore(0, 9)).toBe(4);
    expect(parent.nesting.findFirstChildWithMore(0, 3)).toBeNull();
  });

  it('forgets a list that detached', () => {
    const parent = listIn(null);
    const child = listIn(parent.nesting);
    child.nesting.attach('cell-1');

    child.nesting.detach();

    expect(parent.nesting.findFirstChildWithMore(0, 9)).toBeNull();
  });

  it('passes its scroll events on to every nested list', () => {
    const parent = listIn(null);
    const child = listIn(parent.nesting);
    child.nesting.attach('cell-1');
    const event = { nativeEvent: {} };

    parent.nesting.fanOut.onScroll(event);
    parent.nesting.fanOut.onScrollBeginDrag(event);
    parent.nesting.fanOut.onScrollEndDrag(event);
    parent.nesting.fanOut.onMomentumScrollBegin(event);
    parent.nesting.fanOut.onMomentumScrollEnd(event);

    expect(child.received).toEqual([
      'scroll',
      'begin-drag',
      'end-drag',
      'momentum-begin',
      'momentum-end',
    ]);
  });

  it('tells a list that joins after the user interacted', () => {
    const parent = listIn(null);
    parent.state.hasInteracted = true;
    const child = listIn(parent.nesting);

    child.nesting.attach('cell-1');

    expect(child.received).toEqual(['interaction']);
  });

  it('does not register a list nested under the other orientation', () => {
    const parent = listIn(null);
    const crossing = listIn(parent.nesting, true);

    crossing.nesting.attach('cell-1');

    expect(parent.nesting.findFirstChildWithMore(0, 9)).toBeNull();
  });
});

describe('a nested list finding its cell by walking up its nodes', () => {
  // surface > cell > wrapper > nested list, the cell is two parents above the list
  function cellAbove(): { cell: ISymbioteNode; list: ISymbioteNode } {
    const surface = createSurface(ROOT_TAG);
    const cell = createElement('RCTView', false);
    const wrapper = createElement('RCTView', false);
    const list = createElement('RCTView', false);
    appendChild(wrapper, list);
    appendChild(cell, wrapper);
    surface.appendChild(cell);
    surface.commit();
    return { cell, list };
  }

  it('registers in the cell the parent knows', () => {
    installRecordingFabric();
    const { cell, list } = cellAbove();
    const parent = listIn(null);
    const nested = listIn(parent.nesting);
    parent.nesting.scope.registerCellNode(cell, 'cell-2');

    expect(nested.nesting.attachAt(list)).toBe(true);
    expect(parent.nesting.findFirstChildWithMore(0, 9)).toBe(2);
  });

  it('waits for the parent to learn the cell, then registers', () => {
    installRecordingFabric();
    const { cell, list } = cellAbove();
    const parent = listIn(null);
    const nested = listIn(parent.nesting);

    expect(nested.nesting.attachAt(list)).toBe(false);
    parent.nesting.scope.registerCellNode(cell, 'cell-2');

    expect(parent.nesting.findFirstChildWithMore(0, 9)).toBe(2);
  });

  it('does not register a list that unmounted while it waited', () => {
    installRecordingFabric();
    const { cell, list } = cellAbove();
    const parent = listIn(null);
    const nested = listIn(parent.nesting);
    nested.nesting.attachAt(list);

    nested.nesting.detach();
    parent.nesting.scope.registerCellNode(cell, 'cell-2');

    expect(parent.nesting.findFirstChildWithMore(0, 9)).toBeNull();
  });
});

describe('a nested list placing itself in its parent', () => {
  it('measures against the outermost list and reports the offset and content', () => {
    const parent = listIn(null);
    const child = listIn(parent.nesting);

    child.nesting.child.measureLayoutRelativeToContainingList();

    expect(child.dispatched[0]).toEqual({
      kind: 'parent-layout',
      offsetFromParent: OFFSET_IN_PARENT,
      contentLength: CONTENT,
    });
  });

  it('then takes the parent scroll as it stands', () => {
    const parent = listIn(null);
    const child = listIn(parent.nesting);

    child.nesting.child.measureLayoutRelativeToContainingList();

    expect(child.dispatched[1]).toMatchObject({
      kind: 'parent-scroll',
      offset: 120,
      visibleLength: PARENT_VIEWPORT,
    });
  });

  it('asks for no cell key while no list is nested in it', () => {
    const keys: number[] = [];
    const list = createListNesting({
      parent: null,
      horizontal: false,
      getState: () => createInitialListState<unknown>(),
      dispatch: () => {},
      getContainerNode: () => null,
      getHasMore: () => true,
      keyFor: index => {
        keys.push(index);
        return `cell-${index}`;
      },
      handlers: () => ({
        onScroll: () => {},
        onScrollBeginDrag: () => {},
        onScrollEndDrag: () => {},
        onMomentumScrollBegin: () => {},
        onMomentumScrollEnd: () => {},
        recordInteraction: () => {},
      }),
    });

    expect(list.findFirstChildWithMore(0, 40)).toBeNull();
    expect(keys).toEqual([]);
  });

  it('turns a parent scroll event into the nested list own action', () => {
    const parent = listIn(null);
    const child = listIn(parent.nesting);
    const event = {
      nativeEvent: {
        contentOffset: { x: 0, y: 700 },
        layoutMeasurement: { width: 320, height: PARENT_VIEWPORT },
      },
    };

    expect(child.nesting.parentScrollAction(event, 55)).toEqual({
      kind: 'parent-scroll',
      offset: 700,
      visibleLength: PARENT_VIEWPORT,
      timestamp: 55,
    });
  });
});
