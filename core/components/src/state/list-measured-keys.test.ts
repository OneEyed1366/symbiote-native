// RN keys a measurement by the cell KEY and trusts it only while that key still sits at the index
// it was measured at, so a prepend never lends one item's height to another
import { describe, expect, it } from 'vitest';
import {
  createInitialListState,
  reduceList,
  type IListAction,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';

function inputsFor(data: string[]): IListReducerInputs<string> {
  return {
    data,
    getItem: (_data, index): string => data[index],
    getItemCount: (): number => data.length,
    keyExtractor: item => item,
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

const LENGTHS = [10, 20, 30, 40];

function measuredFour(): { state: IListState<string>; keys: string[] } {
  const keys = ['a', 'b', 'c', 'd'];
  const config = inputsFor(keys);
  const state = createInitialListState<string>();
  step(state, { kind: 'layout', length: 200 }, config);
  let offset = 0;
  LENGTHS.forEach((length, index) => {
    step(state, { kind: 'measure', index, length, offset }, config);
    offset += length;
  });
  return { state, keys };
}

describe('measurements follow the cell key', () => {
  it('keeps a measurement while its key sits at the same index', () => {
    const { state, keys } = measuredFour();

    step(state, { kind: 'refresh-metrics' }, inputsFor([...keys, 'e']));

    expect(state.metrics.lengths.slice(0, 4)).toEqual(LENGTHS);
  });

  it('drops every measurement a prepend moved to another index', () => {
    const { state, keys } = measuredFour();

    step(state, { kind: 'refresh-metrics' }, inputsFor(['x', 'y', ...keys]));

    const average = 25;
    expect(state.metrics.lengths).toEqual(Array(6).fill(average));
  });

  it('takes a fresh measurement of a moved cell at its new index', () => {
    const { state, keys } = measuredFour();
    const config = inputsFor(['x', 'y', ...keys]);
    step(state, { kind: 'refresh-metrics' }, config);

    step(state, { kind: 'measure', index: 2, length: 10, offset: 0 }, config);

    expect(state.metrics.lengths[2]).toBe(10);
  });
});
