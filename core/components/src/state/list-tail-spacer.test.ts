// Without `getItemLayout` RN stops the tail spacer at the highest measured cell, so a fling cannot
// scroll into an area nobody has laid out and watch the content jump as it renders above
import { describe, expect, it } from 'vitest';
import { buildListPlan, LIST_SEGMENT_KIND } from './virtualized-list';
import {
  createInitialListState,
  reduceList,
  type IListReducerInputs,
} from './virtualized-list-reducer';

const COUNT = 10;
const CELL = 100;
const offsets = Array.from({ length: COUNT }, (_unused, index) => index * CELL);
const lengths = Array.from({ length: COUNT }, () => CELL);

function tailExtent(tailLimit: number | undefined): number | undefined {
  const plan = buildListPlan({
    count: COUNT,
    regions: [{ first: 0, last: 2 }],
    offsets,
    lengths,
    keyFor: index => String(index),
    tailLimit,
  });
  const tail = plan.segments.at(-1);
  return tail?.kind === LIST_SEGMENT_KIND.spacer ? tail.extent : undefined;
}

describe('the tail spacer', () => {
  it('spans every unrendered cell when getItemLayout owns the sizes', () => {
    expect(tailExtent(undefined)).toBe(7 * CELL);
  });

  it('stops at the highest measured cell otherwise', () => {
    expect(tailExtent(4)).toBe(2 * CELL);
  });

  it('is empty while nothing past the window is measured', () => {
    expect(tailExtent(0)).toBeUndefined();
  });
});

describe('the highest measured cell', () => {
  const data = Array.from(
    { length: COUNT },
    (_unused, index) => `row-${index}`,
  );

  function inputs(withLayout: boolean): IListReducerInputs<string> {
    return {
      data,
      getItem: (_data, index): string => data[index],
      getItemCount: (): number => data.length,
      getItemLayout: withLayout
        ? (_data, index) => ({ length: CELL, offset: index * CELL, index })
        : undefined,
      horizontal: false,
      windowSize: 21,
      initialNumToRender: 3,
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

  it('limits the tail only when the sizes are measured, never with getItemLayout', () => {
    const measured = createInitialListState<string>();
    reduceList(measured, { kind: 'refresh-metrics' }, inputs(false));
    reduceList(
      measured,
      { kind: 'measure', index: 1, length: CELL, offset: CELL },
      inputs(false),
    );
    reduceList(measured, { kind: 'refresh-metrics' }, inputs(false));

    const fixed = createInitialListState<string>();
    reduceList(fixed, { kind: 'refresh-metrics' }, inputs(true));

    expect(measured.metrics.tailLimit).toBe(1);
    expect(fixed.metrics.tailLimit).toBeUndefined();
  });
});
