// RN holds the window and the edge callbacks while the first scroll event of a list that opens
// past index 0 is still pending, the scroll metrics are stale until it lands
import { describe, expect, it } from 'vitest';
import {
  createInitialListState,
  reduceList,
  type IListAction,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';

const COUNT = 100;
const CELL = 100;
const VIEWPORT = 200;
const START_INDEX = 50;
const DATA = Array.from({ length: COUNT }, (_unused, index) => `row-${index}`);

function inputs(
  over: Partial<IListReducerInputs<string>> = {},
): IListReducerInputs<string> {
  return {
    data: DATA,
    getItem: (_data, index): string => DATA[index],
    getItemCount: (): number => DATA.length,
    getItemLayout: (_data, index) => ({
      length: CELL,
      offset: index * CELL,
      index,
    }),
    horizontal: false,
    windowSize: 5,
    initialNumToRender: 10,
    maxToRenderPerBatch: 10,
    updateCellsBatchingPeriod: 50,
    onEndReachedThreshold: 2,
    onStartReachedThreshold: 2,
    onEndReachedActive: false,
    onStartReachedActive: true,
    viewabilityPairs: [],
    maintainVisibleContentPosition: undefined,
    initialScrollIndex: START_INDEX,
    ...over,
  };
}

function step(
  state: IListState<string>,
  action: IListAction<string>,
  config: IListReducerInputs<string>,
): void {
  reduceList(state, action, config);
  reduceList(state, { kind: 'refresh-metrics' }, config);
}

function opened(config: IListReducerInputs<string>): IListState<string> {
  const state = createInitialListState<string>();
  step(state, { kind: 'refresh-metrics' }, config);
  step(state, { kind: 'layout', length: VIEWPORT }, config);
  return state;
}

describe('a list that opens past index 0', () => {
  it('keeps the initial region until the first scroll event lands', () => {
    const config = inputs();
    const state = opened(config);

    expect(state.metrics.first).toBe(START_INDEX);
    expect(state.metrics.last).toBe(START_INDEX + 9);
  });

  it('derives the window from the scroll offset once the event lands', () => {
    const config = inputs();
    const state = opened(config);

    step(
      state,
      { kind: 'scroll', offset: START_INDEX * CELL, timestamp: 1 },
      config,
    );

    expect(state.metrics.first).toBeLessThanOrEqual(START_INDEX);
    expect(state.metrics.last).toBeGreaterThanOrEqual(START_INDEX + 1);
  });

  it('fires no start-reached while the scroll offset is stale', () => {
    const config = inputs();
    const state = opened(config);

    const pending = reduceList(state, { kind: 'commit' }, config);
    expect(
      pending.effects.some(effect => effect.kind === 'fire-start-reached'),
      'the stale offset 0 must not read as the top',
    ).toBe(false);

    step(
      state,
      { kind: 'scroll', offset: START_INDEX * CELL, timestamp: 1 },
      config,
    );
    const settled = reduceList(state, { kind: 'commit' }, config);
    expect(
      settled.effects.some(effect => effect.kind === 'fire-start-reached'),
    ).toBe(false);
  });

  it('releases the hold when the initial jump moves nothing, no scroll event follows', () => {
    // Without `getItemLayout` the jump resolves against an unmeasured table and lands at 0
    const config = inputs({ getItemLayout: undefined });
    const state = opened(config);

    const commit = reduceList(state, { kind: 'commit' }, config);
    const jump = commit.effects.find(effect => effect.kind === 'scroll-to');
    expect(jump, 'the initial jump is still issued').toBeDefined();
    expect(state.scrollOffset).toBe(0);

    step(state, { kind: 'refresh-metrics' }, config);
    expect(
      state.pendingScrollUpdates,
      'a jump to the offset it already has sends no event',
    ).toBe(0);
  });

  it('derives from the offset at once when the list opens at index 0', () => {
    const config = inputs({ initialScrollIndex: undefined });
    const state = opened(config);

    step(state, { kind: 'scroll', offset: 3_000, timestamp: 1 }, config);

    expect(state.metrics.first).toBeGreaterThan(0);
  });
});
