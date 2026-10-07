// The tail spacer cases of RN's VirtualizedList-test.js, without `getItemLayout`
// A cell is its index, a spacer is `[extent]`, RN's zero-height spacer paints no node here
import { describe, expect, it } from 'vitest';
import { buildListPlan, LIST_SEGMENT_KIND } from './virtualized-list';
import {
  createInitialListState,
  reduceList,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';

const COUNT = 10;
const VIEWPORT = 50;
const LAST_MEASURED = 6;

const data = Array.from({ length: COUNT }, (_unused, index) => index);
const config: IListReducerInputs<number> = {
  data,
  getItem: (_data, index): number => data[index],
  getItemCount: (): number => data.length,
  keyExtractor: item => `${item}`,
  horizontal: false,
  windowSize: 1,
  initialNumToRender: 3,
  maxToRenderPerBatch: 1,
  updateCellsBatchingPeriod: 50,
  onEndReachedThreshold: 2,
  onStartReachedThreshold: 2,
  onEndReachedActive: false,
  onStartReachedActive: false,
  viewabilityPairs: [],
  maintainVisibleContentPosition: undefined,
  initialScrollIndex: undefined,
};

function refresh(state: IListState<number>): void {
  reduceList(state, { kind: 'refresh-metrics' }, config);
}

function sequence(state: IListState<number>): string {
  const m = state.metrics;
  const plan = buildListPlan({
    count: m.count,
    regions: m.regions,
    offsets: m.offsets,
    lengths: m.lengths,
    keyFor: index => `${index}`,
    tailLimit: m.tailLimit,
  });
  return plan.segments
    .map(segment =>
      segment.kind === LIST_SEGMENT_KIND.cell
        ? `${segment.index}`
        : `[${segment.extent}]`,
    )
    .join(' ');
}

function measuredList(
  lengthOf: (index: number) => number,
  offsetOf: (index: number) => number,
  lastMeasured: number,
): IListState<number> {
  const state = createInitialListState<number>();
  refresh(state);
  for (let index = 0; index <= lastMeasured; index += 1) {
    reduceList(
      state,
      {
        kind: 'measure',
        index,
        length: lengthOf(index),
        offset: offsetOf(index),
      },
      config,
    );
  }
  reduceList(state, { kind: 'layout', length: VIEWPORT }, config);
  reduceList(state, { kind: 'content-size', length: 30 }, config);
  reduceList(state, { kind: 'batch-tick' }, config);
  refresh(state);
  return state;
}

describe('RN VirtualizedList: the tail spacer without getItemLayout', () => {
  it('holds no room on the initial render', () => {
    const state = createInitialListState<number>();
    refresh(state);

    expect(sequence(state)).toBe('0 1 2');
  });

  it('holds no room on a batch render while no cell is measured', () => {
    const state = createInitialListState<number>();
    refresh(state);
    reduceList(state, { kind: 'layout', length: VIEWPORT }, config);
    reduceList(state, { kind: 'content-size', length: 200 }, config);
    reduceList(state, { kind: 'batch-tick' }, config);
    refresh(state);

    expect(sequence(state)).toBe('0 1 2');
  });

  it('reaches up to the last measured index', () => {
    const state = measuredList(
      () => 10,
      index => index * 10,
      LAST_MEASURED,
    );

    expect(sequence(state)).toBe('0 1 2 3 4 [20]');
  });

  it('reaches up to the last measured index for an irregular layout', () => {
    const state = measuredList(
      index => index,
      index => (index * (index + 1)) / 2,
      LAST_MEASURED,
    );

    expect(sequence(state)).toBe('0 1 2 3 [17]');
  });

  it('covers every unrendered cell once all of them are measured', () => {
    const state = measuredList(
      () => 10,
      index => index * 10,
      COUNT - 1,
    );

    expect(sequence(state)).toBe('0 1 2 3 4 [50]');
  });
});
