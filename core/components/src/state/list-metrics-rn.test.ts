// Cases of RN's `ListMetricsAggregator-test` at table level, our metrics are reducer maps
// RN throws on an RTL cell measured before the content length is known, we keep its length
// and no offset

import { describe, expect, it } from 'vitest';
import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  averageMeasuredLength,
  offsetForIndex,
  readContentLength,
} from './list-metrics';
import {
  createInitialListState,
  reduceList,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';

const DATA = [1, 2, 3, 4, 5];
const VIEWPORT = 50;

type IFixedLayout = IListReducerInputs<number>['getItemLayout'];

function inputs(
  over: Partial<IListReducerInputs<number>> = {},
): IListReducerInputs<number> {
  return {
    data: DATA,
    getItem: (_data, index): number => DATA[index],
    getItemCount: (): number => DATA.length,
    horizontal: false,
    windowSize: 5,
    initialNumToRender: 10,
    maxToRenderPerBatch: 10,
    updateCellsBatchingPeriod: 50,
    onEndReachedThreshold: 2,
    onStartReachedThreshold: 2,
    onEndReachedActive: false,
    onStartReachedActive: false,
    viewabilityPairs: [],
    maintainVisibleContentPosition: undefined,
    ...over,
  };
}

const horizontalInputs = (): IListReducerInputs<number> =>
  inputs({ horizontal: true, rtl: false });
const rtlInputs = (): IListReducerInputs<number> =>
  inputs({ horizontal: true, rtl: true });
const verticalRtlInputs = (): IListReducerInputs<number> =>
  inputs({ horizontal: false, rtl: true });

function opened(config: IListReducerInputs<number>): IListState<number> {
  const state = createInitialListState<number>();
  reduceList(state, { kind: 'refresh-metrics' }, config);
  reduceList(state, { kind: 'layout', length: VIEWPORT }, config);
  return state;
}

function measure(
  state: IListState<number>,
  config: IListReducerInputs<number>,
  cell: { index: number; length: number; offset: number },
): void {
  reduceList(state, { kind: 'measure', ...cell }, config);
}

// The table a render reads: refresh derives it from what was measured
function tableOf(
  state: IListState<number>,
  config: IListReducerInputs<number>,
): { offsets: number[]; lengths: number[] } {
  reduceList(state, { kind: 'refresh-metrics' }, config);
  return { offsets: state.metrics.offsets, lengths: state.metrics.lengths };
}

function measuredPair(
  config: IListReducerInputs<number>,
  first: { length: number; offset: number },
  second: { length: number; offset: number },
): IListState<number> {
  const state = opened(config);
  measure(state, config, { index: 0, ...first });
  measure(state, config, { index: 1, ...second });
  return state;
}

const FIXED_LAYOUT: IFixedLayout = () => ({ index: 2, length: 40, offset: 30 });

describe('the running average of measured cells', () => {
  it('keeps a running average length', () => {
    const config = inputs();
    const state = opened(config);
    expect(averageMeasuredLength(state.measured)).toBe(0);

    measure(state, config, { index: 0, length: 10, offset: 0 });
    expect(averageMeasuredLength(state.measured)).toBe(10);

    measure(state, config, { index: 1, length: 20, offset: 10 });
    expect(averageMeasuredLength(state.measured)).toBe(15);
  });

  it('adjusts the average when a cell is laid out again', () => {
    const config = inputs();
    const state = measuredPair(
      config,
      { length: 10, offset: 0 },
      { length: 20, offset: 10 },
    );
    expect(averageMeasuredLength(state.measured)).toBe(15);

    measure(state, config, { index: 0, length: 20, offset: 0 });
    expect(averageMeasuredLength(state.measured)).toBe(20);
  });

  it('keeps track of the highest measured cell index', () => {
    const config = inputs();
    const state = opened(config);
    expect(state.highestMeasuredIndex).toBe(0);

    measure(state, config, { index: 0, length: 10, offset: 0 });
    expect(state.highestMeasuredIndex).toBe(0);

    measure(state, config, { index: 1, length: 20, offset: 10 });
    expect(state.highestMeasuredIndex).toBe(1);
  });

  it('resets measurements if the list orientation changes', () => {
    const state = opened(inputs());
    measure(state, inputs(), { index: 0, length: 10, offset: 0 });
    expect(averageMeasuredLength(state.measured)).toBe(10);

    measure(state, horizontalInputs(), { index: 1, length: 5, offset: 0 });
    expect(averageMeasuredLength(state.measured)).toBe(5);
    expect(state.highestMeasuredIndex).toBe(1);
  });

  it('forgets the measurements when only the text direction changes', () => {
    const state = opened(inputs());
    measure(state, inputs(), { index: 0, length: 10, offset: 0 });

    measure(state, verticalRtlInputs(), { index: 1, length: 20, offset: 10 });
    expect(state.measured.has(0)).toBe(false);
    expect(state.measured.get(1)).toBe(20);
  });
});

describe.each([
  ['vertical', inputs],
  ['horizontal', horizontalInputs],
  ['vertical rtl', verticalRtlInputs],
])('the cell table of a %s list', (_label, makeInputs) => {
  it('resolves the metrics of an already measured cell', () => {
    const config = makeInputs();
    const state = measuredPair(
      config,
      { length: 10, offset: 0 },
      { length: 20, offset: 10 },
    );
    const { offsets, lengths } = tableOf(state, config);
    expect([offsets[1], lengths[1]]).toEqual([10, 20]);
  });

  it('estimates the metrics of an unmeasured cell', () => {
    const config = makeInputs();
    const state = measuredPair(
      config,
      { length: 10, offset: 100 },
      { length: 20, offset: 110 },
    );
    const { offsets, lengths } = tableOf(state, config);
    // right after the last measured cell, as long as the average of the two
    expect([offsets[2], lengths[2]]).toEqual([130, 15]);
  });

  it('uses getItemLayout for the metrics of an unmeasured cell', () => {
    const config = makeInputs();
    config.getItemLayout = FIXED_LAYOUT;
    const state = measuredPair(
      config,
      { length: 10, offset: 0 },
      { length: 20, offset: 10 },
    );
    const { offsets, lengths } = tableOf(state, config);
    expect([offsets[2], lengths[2]]).toEqual([30, 40]);
  });
});

describe('the cell table of an RTL horizontal list', () => {
  const CONTENT = 100;

  function rtlOpened(): IListState<number> {
    const state = opened(rtlInputs());
    reduceList(state, { kind: 'content-size', length: CONTENT }, rtlInputs());
    return state;
  }

  it('resolves the metrics of an already measured cell', () => {
    const state = rtlOpened();
    measure(state, rtlInputs(), { index: 0, length: 10, offset: 90 });
    measure(state, rtlInputs(), { index: 1, length: 20, offset: 70 });

    const { offsets, lengths } = tableOf(state, rtlInputs());
    expect([offsets[1], lengths[1]]).toEqual([10, 20]);
  });

  it('estimates the metrics of an unmeasured cell', () => {
    const state = rtlOpened();
    measure(state, rtlInputs(), { index: 0, length: 10, offset: 70 });
    measure(state, rtlInputs(), { index: 1, length: 20, offset: 50 });

    const { offsets, lengths } = tableOf(state, rtlInputs());
    expect([offsets[2], lengths[2]]).toEqual([50, 15]);
  });

  it('uses getItemLayout for the metrics of an unmeasured cell', () => {
    const config = rtlInputs();
    config.getItemLayout = FIXED_LAYOUT;
    const state = rtlOpened();
    measure(state, config, { index: 0, length: 10, offset: 90 });

    const { offsets, lengths } = tableOf(state, config);
    expect([offsets[2], lengths[2]]).toEqual([30, 40]);
  });

  // RN keeps the cells flow-relative, so a content that grew or shrank moves none of them
  it('keeps the metrics of a measured cell across a content length change', () => {
    const state = rtlOpened();
    measure(state, rtlInputs(), { index: 0, length: 10, offset: 90 });
    measure(state, rtlInputs(), { index: 1, length: 20, offset: 70 });

    reduceList(state, { kind: 'content-size', length: 120 }, rtlInputs());
    measure(state, rtlInputs(), { index: 2, length: 20, offset: 50 });
    expect(tableOf(state, rtlInputs()).offsets[1]).toBe(10);

    reduceList(state, { kind: 'content-size', length: CONTENT }, rtlInputs());
    expect(tableOf(state, rtlInputs()).offsets[1]).toBe(10);
  });

  it('keeps the length of a cell measured before the content length is known', () => {
    const state = opened(rtlInputs());
    measure(state, rtlInputs(), { index: 0, length: 5, offset: 0 });
    expect(state.measured.get(0)).toBe(5);
    expect(state.measuredOffsets.has(0)).toBe(false);
  });
});

describe('the offset of a possibly fractional index', () => {
  function offsetOf(index: number): number {
    const config = inputs();
    const state = measuredPair(
      config,
      { length: 10, offset: 0 },
      { length: 20, offset: 10 },
    );
    const { offsets, lengths } = tableOf(state, config);
    return offsetForIndex({
      index,
      viewPosition: 0,
      viewOffset: 0,
      count: DATA.length,
      offsets,
      lengths,
      viewportLength: VIEWPORT,
    });
  }

  it('resolves an integral offset of a measured cell', () => {
    expect(offsetOf(1)).toBe(10);
  });

  it('estimates an integral offset of an unmeasured cell', () => {
    expect(offsetOf(2)).toBe(30);
  });

  it('resolves a fractional offset inside a measured cell', () => {
    expect(offsetOf(1.5)).toBe(20);
  });

  it('estimates a fractional offset inside an unmeasured cell', () => {
    expect(offsetOf(2.5)).toBe(37.5);
  });
});

describe('the content length of a list', () => {
  function sizeEvent(): ISymbioteEvent {
    const target = createElement('RCTScrollView');
    return {
      type: 'contentSizeChange',
      target,
      currentTarget: target,
      nativeEvent: { contentSize: { width: 20, height: 10 } },
      stopPropagation: () => {},
    };
  }

  it('starts unknown and remembers the latest one', () => {
    const config = inputs();
    const state = opened(config);
    expect(state.contentLength).toBeUndefined();

    reduceList(state, { kind: 'content-size', length: 10 }, config);
    expect(state.contentLength).toBe(10);

    reduceList(state, { kind: 'content-size', length: 15 }, config);
    expect(state.contentLength).toBe(15);
  });

  it('reads the height of a vertical list and the width of a horizontal one', () => {
    expect(readContentLength(sizeEvent(), false)).toBe(10);
    expect(readContentLength(sizeEvent(), true)).toBe(20);
  });
});
