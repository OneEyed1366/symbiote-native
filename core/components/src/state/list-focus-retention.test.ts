// RN keeps a viewport's worth of cells around the last focused one mounted, so tabbing between
// focusable items far from the window never blanks, a TextInput keeps its focus as well
import { describe, expect, it } from 'vitest';
import {
  createInitialListState,
  reduceList,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';

const COUNT = 100;
const CELL = 100;
const VIEWPORT = 200;
const data = Array.from({ length: COUNT }, (_unused, index) => `row-${index}`);

function inputs(items: string[] = data): IListReducerInputs<string> {
  return {
    data: items,
    getItem: (_data, index): string => items[index],
    getItemCount: (): number => items.length,
    keyExtractor: item => item,
    getItemLayout: (_data, index) => ({
      length: CELL,
      offset: index * CELL,
      index,
    }),
    horizontal: false,
    windowSize: 3,
    initialNumToRender: 4,
    maxToRenderPerBatch: 100,
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

function opened(config: IListReducerInputs<string>): IListState<string> {
  const state = createInitialListState<string>();
  for (const action of [
    { kind: 'refresh-metrics' },
    { kind: 'layout', length: VIEWPORT },
    { kind: 'refresh-metrics' },
  ] as const) {
    reduceList(state, action, config);
  }
  return state;
}

function scrollTo(
  state: IListState<string>,
  offset: number,
  config: IListReducerInputs<string>,
): void {
  reduceList(state, { kind: 'scroll', offset, timestamp: offset }, config);
  reduceList(state, { kind: 'refresh-metrics' }, config);
}

describe('the cell that holds focus', () => {
  it('keeps a viewport of cells around it mounted after the window leaves', () => {
    const config = inputs();
    const state = opened(config);
    scrollTo(state, 4_000, config);

    reduceList(state, { kind: 'cell-focused', index: 40 }, config);
    scrollTo(state, 9_000, config);

    expect(state.metrics.regions).toContainEqual({ first: 38, last: 42 });
  });

  it('retains nothing before any cell was focused', () => {
    const config = inputs();
    const state = opened(config);

    scrollTo(state, 9_000, config);

    expect(state.metrics.regions).toHaveLength(2);
  });

  it('lets go once the data moved the focused key to another index', () => {
    const config = inputs();
    const state = opened(config);
    scrollTo(state, 4_000, config);
    reduceList(state, { kind: 'cell-focused', index: 40 }, config);

    const shifted = inputs(['x', ...data]);
    scrollTo(state, 9_000, shifted);

    expect(state.metrics.regions).toHaveLength(2);
  });
});
