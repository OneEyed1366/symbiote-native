// What RN mounts before and right after the first layout
import { describe, expect, it } from 'vitest';
import {
  createInitialListState,
  reduceList,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';

const CELL = 10;
const VIEWPORT = 50;
// Shows two of the five initial cells, so nothing is urgent
const SHORT_VIEWPORT = 20;

function inputs(
  count: number,
  over: Partial<IListReducerInputs<number>> = {},
): IListReducerInputs<number> {
  const data = Array.from({ length: count }, (_unused, index) => index);
  return {
    data,
    getItem: (_data, index): number => data[index],
    getItemCount: (): number => data.length,
    keyExtractor: item => String(item),
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

function mounted(state: IListState<number>): [number, number] {
  return [state.metrics.first, state.metrics.last];
}

function refresh(
  state: IListState<number>,
  config: IListReducerInputs<number>,
): void {
  reduceList(state, { kind: 'refresh-metrics' }, config);
}

function laidOut(config: IListReducerInputs<number>): IListState<number> {
  const state = createInitialListState<number>();
  refresh(state, config);
  reduceList(state, { kind: 'layout', length: VIEWPORT }, config);
  refresh(state, config);
  return state;
}

function scrollTo(
  state: IListState<number>,
  offset: number,
  config: IListReducerInputs<number>,
): void {
  reduceList(state, { kind: 'scroll', offset, timestamp: offset }, config);
  refresh(state, config);
}

describe('the first render', () => {
  it('mounts nothing when initialNumToRender is 0', () => {
    const state = createInitialListState<number>();
    refresh(state, inputs(10, { initialNumToRender: 0 }));

    expect(state.metrics.last).toBeLessThan(state.metrics.first);
  });

  it('starts at initialScrollIndex and clamps to the last item', () => {
    const state = createInitialListState<number>();
    refresh(
      state,
      inputs(10, { initialScrollIndex: 4, initialNumToRender: 20 }),
    );

    expect(mounted(state)).toEqual([4, 9]);
  });

  it('clamps the region when the data shrinks below initialScrollIndex', () => {
    const state = createInitialListState<number>();
    refresh(
      state,
      inputs(20, { initialScrollIndex: 14, initialNumToRender: 5 }),
    );
    const shrunk = inputs(15, {
      initialScrollIndex: 14,
      initialNumToRender: 5,
    });
    refresh(state, shrunk);
    reduceList(state, { kind: 'layout', length: VIEWPORT }, shrunk);
    refresh(state, shrunk);

    expect(mounted(state)).toEqual([4, 14]);
  });
});

describe('the initial region after scrolling', () => {
  it('stays mounted when initialScrollIndex is 0', () => {
    const config = inputs(20, { initialNumToRender: 5, windowSize: 1 });
    const state = laidOut(config);
    scrollTo(state, 150, config);

    expect(state.metrics.regions).toContainEqual({ first: 0, last: 4 });
  });

  it('is discarded when initialScrollIndex is not 0', () => {
    const config = inputs(20, {
      initialNumToRender: 5,
      initialScrollIndex: 5,
      windowSize: 1,
    });
    const state = laidOut(config);
    scrollTo(state, 150, config);

    expect(state.metrics.regions).toHaveLength(1);
  });
});

describe('growing the render area', () => {
  it('adds maxToRenderPerBatch cells on a tick, not on layout alone', () => {
    const config = inputs(20, {
      initialNumToRender: 5,
      maxToRenderPerBatch: 2,
    });
    const state = createInitialListState<number>();
    refresh(state, config);
    reduceList(state, { kind: 'layout', length: SHORT_VIEWPORT }, config);
    refresh(state, config);
    expect(mounted(state)).toEqual([0, 4]);

    reduceList(state, { kind: 'batch-tick' }, config);
    refresh(state, config);
    expect(mounted(state)).toEqual([0, 6]);
  });

  it('fills at once when the viewport shows cells past the rendered ones', () => {
    const config = inputs(20, {
      initialNumToRender: 5,
      maxToRenderPerBatch: 2,
    });

    expect(mounted(laidOut(config))).toEqual([0, 6]);
  });

  it('holds the window at initialScrollIndex until the first scroll lands', () => {
    const config = inputs(20, {
      initialNumToRender: 5,
      initialScrollIndex: 1,
      windowSize: 10,
    });
    const state = laidOut(config);
    reduceList(state, { kind: 'batch-tick' }, config);
    refresh(state, config);

    expect(mounted(state)).toEqual([1, 5]);
  });
});
