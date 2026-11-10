// `disableVirtualization`: the window stays anchored at the first cell and only grows toward the
// end, and no spacer stands in for what is not mounted
import { describe, expect, it } from 'vitest';
import { LIST_SEGMENT_KIND, planFromMetrics } from './virtualized-list';
import {
  createInitialListState,
  reduceList,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';

const CELL = 10;
const VIEWPORT = 50;
const COUNT = 40;

function inputs(
  over: Partial<IListReducerInputs<number>> = {},
): IListReducerInputs<number> {
  const data = Array.from({ length: COUNT }, (_unused, index) => index);
  return {
    data,
    getItem: (_data, index): number => data[index],
    getItemCount: (): number => data.length,
    keyExtractor: item => `cell-${item}`,
    getItemLayout: (_data, index) => ({
      length: CELL,
      offset: index * CELL,
      index,
    }),
    horizontal: false,
    windowSize: 3,
    initialNumToRender: 10,
    maxToRenderPerBatch: 5,
    updateCellsBatchingPeriod: 50,
    onEndReachedThreshold: 2,
    onStartReachedThreshold: 2,
    onEndReachedActive: false,
    onStartReachedActive: false,
    viewabilityPairs: [],
    maintainVisibleContentPosition: undefined,
    initialScrollIndex: undefined,
    disableVirtualization: true,
    ...over,
  };
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
  reduceList(state, { kind: 'batch-tick' }, config);
  refresh(state, config);
}

function window(state: IListState<number>): [number, number] {
  return [state.metrics.first, state.metrics.last];
}

describe('disableVirtualization window', () => {
  it('holds the initial render while the end is far away', () => {
    const state = laidOut(inputs());
    scrollTo(state, 20, inputs());

    expect(window(state)).toEqual([0, 9]);
  });

  it('never drops the cells above the viewport', () => {
    const config = inputs();
    const state = laidOut(config);
    scrollTo(state, 250, config);

    expect(state.metrics.first).toBe(0);
  });

  it('adds maxToRenderPerBatch cells once the end is within the threshold', () => {
    const config = inputs();
    const state = laidOut(config);
    scrollTo(state, 300, config);

    expect(window(state)).toEqual([0, 14]);
  });

  it('stops at the last item', () => {
    const config = inputs({ maxToRenderPerBatch: 500 });
    const state = laidOut(config);
    scrollTo(state, 350, config);

    expect(window(state)).toEqual([0, COUNT - 1]);
  });

  it('windows normally when the flag is off', () => {
    const config = inputs({ disableVirtualization: false });
    const state = laidOut(config);
    scrollTo(state, 250, config);

    expect(state.metrics.first).toBeGreaterThan(0);
  });
});

function segmentKinds(state: IListState<number>): string[] {
  const keyFor = (index: number): string => `cell-${index}`;
  return planFromMetrics(state.metrics, keyFor, undefined).plan.segments.map(
    segment => segment.kind,
  );
}

describe('disableVirtualization spacers', () => {
  function kinds(config: IListReducerInputs<number>): string[] {
    const state = laidOut(config);
    scrollTo(state, 300, config);
    return segmentKinds(state);
  }

  it('leaves out the tail spacer', () => {
    expect(kinds(inputs())).not.toContain(LIST_SEGMENT_KIND.spacer);
  });

  it('keeps the tail spacer when virtualized', () => {
    expect(kinds(inputs({ disableVirtualization: false }))).toContain(
      LIST_SEGMENT_KIND.spacer,
    );
  });

  it('leaves out the head spacer of a list opened past the start', () => {
    const config = inputs({ initialScrollIndex: 20 });
    const state = createInitialListState<number>();
    refresh(state, config);

    expect(segmentKinds(state)).not.toContain(LIST_SEGMENT_KIND.spacer);
  });
});
