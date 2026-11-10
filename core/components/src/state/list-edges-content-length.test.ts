// RN measures `onEndReached` against the real content length (header and footer included), not the
// sum of the cells, and dedupes by that same length
import { describe, expect, it } from 'vitest';
import {
  createInitialListState,
  reduceList,
  type IListEffect,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';

const COUNT = 10;
const CELL = 100;
const VIEWPORT = 300;
const FOOTER = 200;
const DATA = Array.from({ length: COUNT }, (_unused, index) => `row-${index}`);

function inputs(): IListReducerInputs<string> {
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
    windowSize: 21,
    initialNumToRender: 10,
    maxToRenderPerBatch: 10,
    updateCellsBatchingPeriod: 50,
    onEndReachedThreshold: 0,
    onStartReachedThreshold: 0,
    onEndReachedActive: true,
    onStartReachedActive: false,
    viewabilityPairs: [],
    maintainVisibleContentPosition: undefined,
  };
}

function opened(config: IListReducerInputs<string>): IListState<string> {
  const state = createInitialListState<string>();
  reduceList(state, { kind: 'refresh-metrics' }, config);
  reduceList(state, { kind: 'layout', length: VIEWPORT }, config);
  reduceList(state, { kind: 'refresh-metrics' }, config);
  return state;
}

function scrollAndCommit(
  state: IListState<string>,
  offset: number,
  config: IListReducerInputs<string>,
): IListEffect<string>[] {
  reduceList(state, { kind: 'scroll', offset, timestamp: offset }, config);
  reduceList(state, { kind: 'refresh-metrics' }, config);
  return reduceList(state, { kind: 'commit' }, config).effects;
}

describe('onEndReached against the real content length', () => {
  it('keeps waiting while a footer is still below the viewport', () => {
    const config = inputs();
    const state = opened(config);
    reduceList(
      state,
      { kind: 'content-size', length: COUNT * CELL + FOOTER },
      config,
    );

    // the cells end at 1000, the last cell is in view at 700, the footer (200) still below
    expect(scrollAndCommit(state, 700, config)).toEqual([]);
  });

  it('fires once the real end is within the threshold, with the real distance', () => {
    const config = inputs();
    const state = opened(config);
    reduceList(
      state,
      { kind: 'content-size', length: COUNT * CELL + FOOTER },
      config,
    );

    expect(scrollAndCommit(state, 900, config)).toEqual([
      { kind: 'fire-end-reached', distanceFromEnd: 0 },
    ]);
  });

  it('measures the cells alone while no content length is known', () => {
    const config = inputs();
    const state = opened(config);

    expect(scrollAndCommit(state, 700, config)).toEqual([
      { kind: 'fire-end-reached', distanceFromEnd: 0 },
    ]);
  });
});
