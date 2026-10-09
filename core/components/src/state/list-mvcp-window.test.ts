// RN `getDerivedStateFromProps`: with `maintainVisibleContentPosition`, a changed item count
// moves the render window by where the anchor key went, so native keeps its views to anchor on
import { describe, expect, it } from 'vitest';
import {
  createInitialListState,
  reduceList,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';

const CELL = 10;
const VIEWPORT = 50;
const SIZE = 20;

function config(
  data: number[],
  minIndexForVisible: number,
): IListReducerInputs<number> {
  return {
    data,
    getItem: (_data, index) => data[index],
    getItemCount: () => data.length,
    keyExtractor: item => `k${item}`,
    getItemLayout: (_data, index) => ({
      length: CELL,
      offset: index * CELL,
      index,
    }),
    horizontal: false,
    windowSize: 1,
    initialNumToRender: 1,
    maxToRenderPerBatch: 10,
    updateCellsBatchingPeriod: 50,
    onEndReachedThreshold: 2,
    onStartReachedThreshold: 2,
    onEndReachedActive: false,
    onStartReachedActive: false,
    viewabilityPairs: [],
    maintainVisibleContentPosition: { minIndexForVisible },
    initialScrollIndex: undefined,
  };
}

function refresh(
  state: IListState<number>,
  inputs: IListReducerInputs<number>,
) {
  reduceList(state, { kind: 'refresh-metrics' }, inputs);
}

// Laid out and batched to the viewport: the window is [0, 4]
function settled(inputs: IListReducerInputs<number>): IListState<number> {
  const state = createInitialListState<number>();
  refresh(state, inputs);
  reduceList(state, { kind: 'layout', length: VIEWPORT }, inputs);
  for (let pass = 0; pass < SIZE; pass += 1) {
    reduceList(state, { kind: 'batch-tick' }, inputs);
    refresh(state, inputs);
  }
  return state;
}

const items = Array.from({ length: SIZE }, (_unused, index) => index);
const windowOf = (state: IListState<number>): [number, number] => [
  state.metrics.first,
  state.metrics.last,
];

describe('the window follows the anchor key', () => {
  it('moves down by the number of prepended items', () => {
    const state = settled(config(items, 0));
    expect(windowOf(state)).toEqual([0, 4]);

    const prepended = [
      ...Array.from({ length: 10 }, (_u, i) => SIZE + i),
      ...items,
    ];
    refresh(state, config(prepended, 0));

    expect(windowOf(state)).toEqual([10, 14]);
  });

  it('waits for the scroll event native MVCP sends', () => {
    const state = settled(config(items, 0));
    const before = state.pendingScrollUpdates;

    refresh(state, config([100, ...items], 0));

    expect(state.pendingScrollUpdates).toBe(before + 1);
  });

  it('moves up when the anchor slides before minIndexForVisible', () => {
    const state = settled(config(items, 1));

    refresh(state, config(items.slice(1), 1));

    expect(windowOf(state)).toEqual([0, 3]);
  });

  it('leaves the window alone when the anchor key did not move', () => {
    const state = settled(config(items, 0));

    refresh(state, config([...items, 50], 0));

    expect(windowOf(state)[0]).toBe(0);
    expect(state.pendingScrollUpdates).toBe(0);
  });

  it('leaves the window alone when the anchor item is gone from the data', () => {
    const state = settled(config(items, 0));

    refresh(
      state,
      config(
        Array.from({ length: 25 }, (_u, i) => 100 + i),
        0,
      ),
    );

    expect(windowOf(state)[0]).toBe(0);
    expect(state.pendingScrollUpdates).toBe(0);
  });

  it('tracks no anchor once the list is no longer than minIndexForVisible', () => {
    const state = settled(config(items, 2));

    refresh(state, config([0, 1], 2));

    expect(state.firstVisibleKey).toBeNull();
    expect(state.pendingScrollUpdates).toBe(0);
  });

  it('does not shift without maintainVisibleContentPosition', () => {
    const state = settled({
      ...config(items, 0),
      maintainVisibleContentPosition: undefined,
    });

    refresh(state, {
      ...config([100, ...items], 0),
      maintainVisibleContentPosition: undefined,
    });

    expect(windowOf(state)[0]).toBe(0);
  });
});
