// RN keeps a horizontal list in RTL flow-relative (offsets count from the right edge) and converts
// at the native boundary: a scroll event, a cell layout, an imperative scroll
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';
import { scrollActionOf } from './list-events';
import {
  createInitialListState,
  reduceList,
  type IListAction,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';

const COUNT = 10;
const CELL = 100;
const VIEWPORT = 300;
const CONTENT = 1_000;
const DATA = Array.from({ length: COUNT }, (_unused, index) => `row-${index}`);

function inputs(
  over: Partial<IListReducerInputs<string>> = {},
): IListReducerInputs<string> {
  return {
    data: DATA,
    getItem: (_data, index): string => DATA[index],
    getItemCount: (): number => DATA.length,
    horizontal: true,
    rtl: true,
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

function opened(config: IListReducerInputs<string>): IListState<string> {
  const state = createInitialListState<string>();
  reduceList(state, { kind: 'refresh-metrics' }, config);
  reduceList(state, { kind: 'layout', length: VIEWPORT }, config);
  return state;
}

function scrollEvent(x: number): ISymbioteEvent {
  const target = createElement('RCTScrollView');
  return {
    type: 'scroll',
    target,
    currentTarget: target,
    nativeEvent: {
      contentOffset: { x, y: 0 },
      contentSize: { width: CONTENT, height: 40 },
      layoutMeasurement: { width: VIEWPORT, height: 40 },
    },
    stopPropagation: () => {},
  };
}

function effectsOf(
  state: IListState<string>,
  action: IListAction<string>,
  config: IListReducerInputs<string>,
): ReturnType<typeof reduceList<string>>['effects'] {
  return reduceList(state, action, config).effects;
}

describe('a scroll event of an RTL horizontal list', () => {
  it('reads the offset from the right edge of the content', () => {
    // content 1000, viewport 300, scrolled 100 from the left: 600 left of the right edge
    expect(scrollActionOf(scrollEvent(100), true, 1, true)).toEqual({
      kind: 'scroll',
      offset: 600,
      timestamp: 1,
    });
  });

  it('is the plain x offset when the list is not RTL', () => {
    expect(scrollActionOf(scrollEvent(100), true, 1, false)).toEqual({
      kind: 'scroll',
      offset: 100,
      timestamp: 1,
    });
  });
});

describe('a cell measurement of an RTL horizontal list', () => {
  it('stores the offset from the right edge once the content length is known', () => {
    const config = inputs();
    const state = opened(config);
    reduceList(state, { kind: 'content-size', length: CONTENT }, config);

    reduceList(
      state,
      { kind: 'measure', index: 2, length: CELL, offset: 700 },
      config,
    );

    // content 1000 - (x 700 + width 100)
    expect(state.measuredOffsets.get(2)).toBe(200);
    expect(state.measured.get(2)).toBe(CELL);
  });

  it('keeps the length but not the offset while the content length is unknown', () => {
    const config = inputs();
    const state = opened(config);

    reduceList(
      state,
      { kind: 'measure', index: 2, length: CELL, offset: 700 },
      config,
    );

    expect(state.measured.get(2)).toBe(CELL);
    expect(state.measuredOffsets.has(2)).toBe(false);
  });

  it('stores the raw x offset when the list is not RTL', () => {
    const config = inputs({ rtl: false });
    const state = opened(config);
    reduceList(state, { kind: 'content-size', length: CONTENT }, config);

    reduceList(
      state,
      { kind: 'measure', index: 2, length: CELL, offset: 700 },
      config,
    );

    expect(state.measuredOffsets.get(2)).toBe(700);
  });
});

describe('an imperative scroll of an RTL horizontal list', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('right-aligns the offset: content - (offset + viewport)', () => {
    const config = inputs();
    const state = opened(config);
    reduceList(state, { kind: 'content-size', length: CONTENT }, config);

    expect(
      effectsOf(
        state,
        { kind: 'scroll-to-offset', offset: 200, animated: true },
        config,
      ),
    ).toEqual([{ kind: 'scroll-to', offset: 500, animated: true }]);
  });

  it('warns and scrolls nowhere before the content is laid out', () => {
    const config = inputs();
    const state = opened(config);

    expect(
      effectsOf(
        state,
        { kind: 'scroll-to-offset', offset: 200, animated: true },
        config,
      ),
    ).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'scrollToOffset may not be called in RTL before content is laid out',
    );
  });

  it('is untouched when the list is not RTL', () => {
    const config = inputs({ rtl: false });
    const state = opened(config);

    expect(
      effectsOf(
        state,
        { kind: 'scroll-to-offset', offset: 200, animated: true },
        config,
      ),
    ).toEqual([{ kind: 'scroll-to', offset: 200, animated: true }]);
  });

  it('is untouched on a vertical list even with RTL on', () => {
    const config = inputs({ horizontal: false });
    const state = opened(config);

    expect(
      effectsOf(
        state,
        { kind: 'scroll-to-offset', offset: 200, animated: true },
        config,
      ),
    ).toEqual([{ kind: 'scroll-to', offset: 200, animated: true }]);
  });
});
