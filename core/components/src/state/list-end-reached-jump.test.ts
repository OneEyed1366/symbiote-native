// RN 0.74 did not fire `onEndReached` with `getItemLayout` after a jump far past the render window

import { describe, expect, it } from 'vitest';
import {
  createInitialListState,
  reduceList,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';

const COUNT = 300;
const CELL = 100;
const VIEWPORT = 600;
const DATA = Array.from({ length: COUNT }, (_unused, index) => `row-${index}`);

const inputs: IListReducerInputs<string> = {
  data: DATA,
  getItem: (_data, index): string => DATA[index],
  getItemCount: (): number => DATA.length,
  keyExtractor: undefined,
  getItemLayout: (_data, index) => ({
    length: CELL,
    offset: index * CELL,
    index,
  }),
  horizontal: false,
  windowSize: 5,
  initialNumToRender: 6,
  maxToRenderPerBatch: 10,
  updateCellsBatchingPeriod: 50,
  onEndReachedThreshold: 1,
  onStartReachedThreshold: 1,
  onEndReachedActive: true,
  onStartReachedActive: false,
  viewabilityPairs: [],
  maintainVisibleContentPosition: undefined,
  initialScrollIndex: undefined,
};

function step(
  state: IListState<string>,
  action: Parameters<typeof reduceList<string>>[1],
): IListState<string> {
  const next = reduceList(state, action, inputs).state;
  return reduceList(next, { kind: 'refresh-metrics' }, inputs).state;
}

describe('onEndReached after a jump past the render window', () => {
  it('fires once the window has moved to the last cell', () => {
    let state = step(createInitialListState<string>(), {
      kind: 'layout',
      length: VIEWPORT,
    });
    state = step(state, { kind: 'scroll', offset: COUNT * CELL - VIEWPORT });

    const fired: number[] = [];
    for (let tick = 0; tick < 5; tick += 1) {
      const result = reduceList(state, { kind: 'commit' }, inputs);
      for (const effect of result.effects) {
        if (effect.kind === 'fire-end-reached') {
          fired.push(effect.distanceFromEnd);
        }
      }
      state = step(result.state, { kind: 'batch-tick' });
    }

    expect(fired).toEqual([0]);
  });
});
