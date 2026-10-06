// Nesting as RN models it: a child list reads the parent's scroll metrics, and the parent keeps
// its window short of a cell whose child list still has more to render
import { describe, expect, it } from 'vitest';
import { createChildRegistry } from './nested-scope';
import {
  createInitialListState,
  reduceList,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';
import { listHasMore } from './list-derive';

const COUNT = 50;
const CELL = 100;
const PARENT_VIEWPORT = 400;
const data = Array.from({ length: COUNT }, (_unused, index) => `row-${index}`);

function inputs(
  over: Partial<IListReducerInputs<string>> = {},
): IListReducerInputs<string> {
  return {
    data,
    getItem: (_data, index): string => data[index],
    getItemCount: (): number => data.length,
    keyExtractor: item => item,
    getItemLayout: (_data, index) => ({
      length: CELL,
      offset: index * CELL,
      index,
    }),
    horizontal: false,
    windowSize: 21,
    initialNumToRender: 10,
    maxToRenderPerBatch: 10,
    updateCellsBatchingPeriod: 50,
    onEndReachedThreshold: 2,
    onStartReachedThreshold: 2,
    onEndReachedActive: false,
    onStartReachedActive: false,
    viewabilityPairs: [],
    maintainVisibleContentPosition: undefined,
    initialScrollIndex: undefined,
    ...over,
  };
}

function refresh(
  state: IListState<string>,
  config: IListReducerInputs<string>,
): void {
  reduceList(state, { kind: 'refresh-metrics' }, config);
}

describe('the child list registry', () => {
  it('finds children by the cell they sit in', () => {
    const registry = createChildRegistry<string>();
    registry.add('a', 'cell-1');
    registry.add('b', 'cell-1');
    registry.add('c', 'cell-2');

    const seen: string[] = [];
    registry.forEachInCell('cell-1', child => seen.push(child));

    expect(seen).toEqual(['a', 'b']);
    expect(registry.size()).toBe(3);
    expect(registry.anyInCell('cell-2', child => child === 'c')).toBe(true);
    expect(registry.anyInCell('cell-3', () => true)).toBe(false);
  });

  it('forgets a removed child and its empty cell', () => {
    const registry = createChildRegistry<string>();
    registry.add('a', 'cell-1');

    registry.remove('a');

    expect(registry.size()).toBe(0);
    expect(registry.anyInCell('cell-1', () => true)).toBe(false);
  });

  it('refuses a child added twice or removed without being added', () => {
    const registry = createChildRegistry<string>();
    registry.add('a', 'cell-1');

    expect(() => registry.add('a', 'cell-2')).toThrow(/already present/);
    expect(() => registry.remove('b')).toThrow(/non-present/);
  });
});

describe('a nested list reading its parent', () => {
  function nested(): IListState<string> {
    const state = createInitialListState<string>();
    refresh(state, inputs());
    reduceList(
      state,
      { kind: 'parent-layout', offsetFromParent: 300, contentLength: 5_000 },
      inputs(),
    );
    return state;
  }

  it('takes the parent viewport and its offset relative to itself', () => {
    const state = nested();

    reduceList(
      state,
      {
        kind: 'parent-scroll',
        offset: 500,
        visibleLength: PARENT_VIEWPORT,
        timestamp: 10,
      },
      inputs(),
    );

    expect(state.scrollOffset).toBe(200);
    expect(state.viewportLength).toBe(PARENT_VIEWPORT);
  });

  it('ignores the parent scroll until it knows where it sits', () => {
    const state = createInitialListState<string>();
    refresh(state, inputs());

    reduceList(
      state,
      {
        kind: 'parent-scroll',
        offset: 500,
        visibleLength: PARENT_VIEWPORT,
        timestamp: 10,
      },
      inputs(),
    );

    expect(state.scrollOffset).toBe(0);
    expect(state.viewportLength).toBe(0);
  });

  it('windows by the converted offset', () => {
    const state = nested();
    const config = inputs({ windowSize: 1, initialNumToRender: 1 });

    reduceList(
      state,
      {
        kind: 'parent-scroll',
        offset: 2_300,
        visibleLength: PARENT_VIEWPORT,
        timestamp: 10,
      },
      config,
    );
    refresh(state, config);

    expect(state.metrics.first).toBeGreaterThanOrEqual(18);
  });
});

describe('a parent holding its window for a child that has more', () => {
  it('stops at the first cell whose child list is not done', () => {
    const state = createInitialListState<string>();
    const config = inputs({ findFirstChildWithMore: () => 3 });
    refresh(state, config);
    reduceList(state, { kind: 'layout', length: PARENT_VIEWPORT }, config);
    refresh(state, config);
    reduceList(state, { kind: 'batch-tick' }, config);
    refresh(state, config);

    expect(state.metrics.last).toBe(3);
  });

  it('leaves the window alone when no child has more', () => {
    const state = createInitialListState<string>();
    const config = inputs({ findFirstChildWithMore: () => null });
    refresh(state, config);
    reduceList(state, { kind: 'layout', length: PARENT_VIEWPORT }, config);
    refresh(state, config);
    reduceList(state, { kind: 'batch-tick' }, config);
    refresh(state, config);

    expect(state.metrics.last).toBeGreaterThan(3);
  });

  it('says whether the window stops short of the last item', () => {
    const state = createInitialListState<string>();
    refresh(state, inputs());

    expect(listHasMore(state)).toBe(true);
  });
});
