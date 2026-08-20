// Negative group: ONE action kind rejects — 'scroll-to-index' with an index outside the data range,
// which reproduces RN VirtualizedList.js's three invariants verbatim. Every other action kind is
// total (the switch has no default/throw) and produces a state+effects pair, so the rest of the
// scenarios below are Positive; an invalid `action.kind` is unreachable through the typed union, so
// there is no further "must throw" case to invent.
//
// Coverage gap (not fabricated): commitList's maintainVisibleContentPosition 'shift' and
// 'autoscroll-top' branches (virtualized-list.ts computeMvcpAdjustment, called from here) are not
// exercised — only the 'none'/first-commit-records-anchor branch is. Triggering 'shift' requires a
// genuinely virtualized window (committedWindow.first > 0) PLUS a real prepend across two commits;
// building that without re-deriving computeWindow's own throttling arithmetic would make the
// assertion a restatement of the implementation rather than an independently-checkable fact, so it
// is left as an open gap rather than a characterization.
import { describe, it, expect } from 'vitest';
import {
  reduceList,
  createInitialListState,
  listEffectSignature,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';
import type { IViewabilityConfigCallbackPair } from './virtualized-list';

// A small fixed-layout list: 5 cells of 100px, viewport driven by the test. getItemLayout makes
// offsets deterministic (offsets[i] = i*100, total = 500), so the window covers everything at a
// 200px viewport and edge/viewability outcomes are exact.
const DATA = ['a', 'b', 'c', 'd', 'e'];

function baseInputs(
  over: Partial<IListReducerInputs<string>> = {},
): IListReducerInputs<string> {
  return {
    data: DATA,
    getItem: (_data, index): string => DATA[index],
    getItemCount: (): number => DATA.length,
    keyExtractor: undefined,
    getItemLayout: (_data, index) => ({
      length: 100,
      offset: index * 100,
      index,
    }),
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
    ...over,
  };
}

// Mirror the adapter loop: apply a scalar action, then the render-time metrics refresh (the adapter
// fires refresh-metrics from its render body exactly once, which is what derives the window).
function stepTo(
  state: IListState<string>,
  action: Parameters<typeof reduceList<string>>[1],
  inputs: IListReducerInputs<string>,
): IListState<string> {
  const next = reduceList(state, action, inputs).state;
  return reduceList(next, { kind: 'refresh-metrics' }, inputs).state;
}

// Drive the list to a settled viewport so metrics are populated (layout then a render refresh).
function settled(
  inputs: IListReducerInputs<string>,
  viewport = 200,
): IListState<string> {
  return stepTo(
    createInitialListState<string>(),
    { kind: 'layout', length: viewport },
    inputs,
  );
}

const noopViewablePair: IViewabilityConfigCallbackPair<string> = {
  viewabilityConfig: { itemVisiblePercentThreshold: 50 },
  onViewableItemsChanged: (): void => {},
};

describe('createInitialListState', () => {
  it('starts with an empty measured map and an inverted (empty) committed window', () => {
    const state = createInitialListState<string>();
    expect(state.scrollOffset).toBe(0);
    expect(state.viewportLength).toBe(0);
    expect(state.measured.size).toBe(0);
    expect(state.committedWindow).toEqual({ first: 0, last: -1 });
    expect(state.firstVisibleKey).toBeNull();
    expect(state.metrics.count).toBe(0);
  });
});

describe('reduceList metrics transitions', () => {
  it('layout populates the window and reports changed', () => {
    const inputs = baseInputs();
    const laid = reduceList(
      createInitialListState<string>(),
      { kind: 'layout', length: 200 },
      inputs,
    );
    expect(laid.changed).toBe(true);
    expect(laid.state.viewportLength).toBe(200);
    // The window derives on the render's refresh-metrics, not on the layout action itself.
    const rendered = reduceList(
      laid.state,
      { kind: 'refresh-metrics' },
      inputs,
    ).state;
    expect(rendered.metrics.count).toBe(5);
    expect(rendered.metrics.total).toBe(500);
    expect(rendered.metrics.first).toBe(0);
    expect(rendered.metrics.last).toBe(4);
  });

  it('scroll records the offset and flips hasInteracted', () => {
    const inputs = baseInputs();
    const result = reduceList(
      settled(inputs),
      { kind: 'scroll', offset: 120 },
      inputs,
    );
    expect(result.changed).toBe(true);
    expect(result.state.scrollOffset).toBe(120);
    expect(result.state.hasInteracted).toBe(true);
  });

  it('measure is a no-op when getItemLayout owns cell sizes', () => {
    const inputs = baseInputs();
    const result = reduceList(
      settled(inputs),
      { kind: 'measure', index: 0, length: 42 },
      inputs,
    );
    expect(result.changed).toBe(false);
    expect(result.state.measured.size).toBe(0);
  });

  // why: a relayout does not reproduce a float bit-for-bit, so an onLayout that changed nothing
  // observable still comes back a few ulps off. Under a strict ===, every one of those was a change:
  // the reducer stored it, the spacer derived from it moved in its last bits, Fabric committed,
  // Yoga relaid out, and the next onLayout started the turn again — a loop at frame rate. Measured
  // on device 2026-08-19: 1795 recomputes over one short drag, its log full of `27.33 -> 27.33`.
  // Not storing the noisy value is the half that matters; a stored value that keeps twitching keeps
  // the spacer twitching with it.
  it('treats a sub-pixel re-report as the same measurement and keeps the stored value', () => {
    const inputs = baseInputs({ getItemLayout: undefined });
    const first = reduceList(
      settled(inputs),
      { kind: 'measure', index: 0, length: 27.333333333333332, offset: 100 },
      inputs,
    );
    expect(first.changed).toBe(true);

    const noise = reduceList(
      first.state,
      { kind: 'measure', index: 0, length: 27.333333333333336, offset: 100 },
      inputs,
    );
    expect(noise.changed).toBe(false);
    expect(noise.state.measured.get(0)).toBe(27.333333333333332);
  });

  // why: the other side of the same guard — a real move is at least one device pixel (a third of a
  // point at @3x), and must never be swallowed as noise.
  it('still reports a change when a cell moves by a single device pixel', () => {
    const inputs = baseInputs({ getItemLayout: undefined });
    const first = reduceList(
      settled(inputs),
      { kind: 'measure', index: 0, length: 30, offset: 100 },
      inputs,
    );
    const moved = reduceList(
      first.state,
      { kind: 'measure', index: 0, length: 30, offset: 100 + 1 / 3 },
      inputs,
    );
    expect(moved.changed).toBe(true);
    expect(moved.state.measuredOffsets.get(0)).toBeCloseTo(100.333, 3);
  });

  it('measure records a fresh length but dedups a repeat', () => {
    const inputs = baseInputs({ getItemLayout: undefined });
    const first = reduceList(
      settled(inputs),
      { kind: 'measure', index: 0, length: 30 },
      inputs,
    );
    expect(first.changed).toBe(true);
    expect(first.state.measured.get(0)).toBe(30);
    const repeat = reduceList(
      first.state,
      { kind: 'measure', index: 0, length: 30 },
      inputs,
    );
    expect(repeat.changed).toBe(false);
  });

  // why: RN's recordInteraction() ungates waitForInteraction AND runs _updateViewableItems right
  // there (VirtualizedList.js ~288-296), so an app that calls it reports its viewable items
  // immediately. Flipping the flag alone leaves the report waiting for the next scroll or commit —
  // on a list that fits the viewport and is never scrolled, that next event may never come, and
  // onViewableItemsChanged silently never fires at all.
  it('record-interaction reports the newly ungated viewable items at once', () => {
    const inputs = baseInputs({
      viewabilityPairs: [
        {
          viewabilityConfig: {
            itemVisiblePercentThreshold: 50,
            waitForInteraction: true,
          },
          onViewableItemsChanged: (): void => {},
        },
      ],
    });
    const state = settled(inputs);
    // Gated: nothing is reported while the interaction has not happened.
    expect(
      reduceList(state, { kind: 'commit' }, inputs).effects.filter(
        effect => effect.kind === 'fire-viewable',
      ),
    ).toEqual([]);

    const result = reduceList(state, { kind: 'record-interaction' }, inputs);

    const fired = result.effects.find(
      effect => effect.kind === 'fire-viewable',
    );
    if (fired?.kind !== 'fire-viewable')
      throw new Error('expected fire-viewable');
    expect(fired.info.viewableItems.map(token => token.index)).toEqual([0, 1]);
  });

  it('record-interaction flips the flag without a re-render', () => {
    const inputs = baseInputs();
    const result = reduceList(
      settled(inputs),
      { kind: 'record-interaction' },
      inputs,
    );
    expect(result.changed).toBe(false);
    expect(result.state.hasInteracted).toBe(true);
  });

  // why: the refill timer firing must itself ask for a re-render (changed: true) — that render's
  // own refresh-metrics is what actually grows the throttled window one batch step. If batch-tick
  // did not report changed, a lagging window would never catch up to its target.
  it('batch-tick reports changed so the adapter re-renders and grows the window', () => {
    const inputs = baseInputs();
    const before = settled(inputs);
    const result = reduceList(before, { kind: 'batch-tick' }, inputs);
    expect(result.changed).toBe(true);
    expect(result.state).toBe(before);
  });
});

describe('reduceList commit — onEndReached', () => {
  it('fires once when the last cell is rendered within threshold, then dedups', () => {
    const inputs = baseInputs({ onEndReachedActive: true });
    const state = stepTo(
      settled(inputs),
      { kind: 'scroll', offset: 300 },
      inputs,
    );

    const first = reduceList(state, { kind: 'commit' }, inputs);
    expect(first.effects).toContainEqual({
      kind: 'fire-end-reached',
      distanceFromEnd: 0,
    });

    const second = reduceList(first.state, { kind: 'commit' }, inputs);
    expect(
      second.effects.some(effect => effect.kind === 'fire-end-reached'),
    ).toBe(false);
  });

  it('stays silent when no onEndReached listener is active', () => {
    const inputs = baseInputs({ onEndReachedActive: false });
    const state = stepTo(
      settled(inputs),
      { kind: 'scroll', offset: 300 },
      inputs,
    );
    const result = reduceList(state, { kind: 'commit' }, inputs);
    expect(
      result.effects.some(effect => effect.kind === 'fire-end-reached'),
    ).toBe(false);
  });
});

describe('reduceList commit — onStartReached', () => {
  it('fires at the top edge when a listener is active, then dedups on the next commit', () => {
    const inputs = baseInputs({ onStartReachedActive: true });
    const state = settled(inputs);
    const first = reduceList(state, { kind: 'commit' }, inputs);
    expect(first.effects).toContainEqual({
      kind: 'fire-start-reached',
      distanceFromStart: 0,
    });

    // why: onStartReached must fire once per content length, exactly like onEndReached — the
    // adapters used to independently re-derive this dedup and drift; a repeat commit at the same
    // edge must stay silent.
    const second = reduceList(first.state, { kind: 'commit' }, inputs);
    expect(
      second.effects.some(effect => effect.kind === 'fire-start-reached'),
    ).toBe(false);
  });

  // why: the mirror of onEndReached's "stays silent" case — no adapter callback is wired, so the
  // reducer must not compute or fire the edge event at all.
  it('stays silent when no onStartReached listener is active', () => {
    const inputs = baseInputs({ onStartReachedActive: false });
    const state = settled(inputs);
    const result = reduceList(state, { kind: 'commit' }, inputs);
    expect(
      result.effects.some(effect => effect.kind === 'fire-start-reached'),
    ).toBe(false);
  });
});

describe('reduceList commit — viewability', () => {
  it('emits fire-viewable for the newly visible cells, then dedups after viewable-fired', () => {
    const inputs = baseInputs({ viewabilityPairs: [noopViewablePair] });
    const state = settled(inputs);

    const first = reduceList(state, { kind: 'commit' }, inputs);
    const fired = first.effects.find(effect => effect.kind === 'fire-viewable');
    expect(fired).toBeDefined();
    if (fired?.kind !== 'fire-viewable')
      throw new Error('expected fire-viewable');
    expect(fired.delay).toBe(0);
    expect(fired.info.viewableItems.map(token => token.index)).toEqual([0, 1]);

    // Fold the fired set back, exactly as the adapter does once the (zero) debounce completes.
    const settledState = reduceList(
      first.state,
      { kind: 'viewable-fired', map: fired.map },
      inputs,
    ).state;
    const second = reduceList(settledState, { kind: 'commit' }, inputs);
    expect(second.effects.some(effect => effect.kind === 'fire-viewable')).toBe(
      false,
    );
  });
});

describe('reduceList commit — batch fill', () => {
  it('schedules a refill when the throttled window lags the target', () => {
    // A big list so the window is a real subset. windowSize 3 keeps the target small; a scroll
    // shifts it to an overlapping window that maxToRenderPerBatch 1 cannot reach in one step, so the
    // throttled window lags the target and a refill must be scheduled.
    const bigData = Array.from({ length: 100 }, (_value, i) => `item-${i}`);
    const inputs = baseInputs({
      data: bigData,
      getItem: (_data, index): string => bigData[index],
      getItemCount: (): number => bigData.length,
      windowSize: 3,
      maxToRenderPerBatch: 1,
    });
    const state = stepTo(
      settled(inputs, 100),
      { kind: 'scroll', offset: 300 },
      inputs,
    );
    const result = reduceList(state, { kind: 'commit' }, inputs);
    expect(result.state.metrics.last).toBeLessThan(
      result.state.metrics.target.last,
    );
    expect(result.effects).toContainEqual({
      kind: 'schedule-refill',
      delay: 50,
    });
  });
});

describe('reduceList commit — initialScrollIndex', () => {
  it('scrolls to the index once, then never again', () => {
    const inputs = baseInputs({ initialScrollIndex: 3 });
    const state = settled(inputs);
    const first = reduceList(state, { kind: 'commit' }, inputs);
    expect(first.effects).toContainEqual({
      kind: 'scroll-to',
      offset: 300,
      animated: false,
    });
    expect(first.state.appliedInitialScroll).toBe(true);
    const second = reduceList(first.state, { kind: 'commit' }, inputs);
    expect(second.effects.some(effect => effect.kind === 'scroll-to')).toBe(
      false,
    );
  });
});

describe('reduceList commit — maintainVisibleContentPosition', () => {
  it('records the anchor key on the first commit without scrolling', () => {
    const inputs = baseInputs({
      maintainVisibleContentPosition: { minIndexForVisible: 0 },
    });
    const state = settled(inputs);
    const result = reduceList(state, { kind: 'commit' }, inputs);
    expect(result.state.firstVisibleKey).toBe('0');
    expect(result.effects.some(effect => effect.kind === 'scroll-to')).toBe(
      false,
    );
  });
});

describe('reduceList imperative scrolls', () => {
  it('scroll-to-offset passes the offset straight through', () => {
    const inputs = baseInputs();
    const result = reduceList(
      settled(inputs),
      { kind: 'scroll-to-offset', offset: 250, animated: true },
      inputs,
    );
    expect(result.effects).toEqual([
      { kind: 'scroll-to', offset: 250, animated: true },
    ]);
  });

  it('scroll-to-end resolves the bottom offset', () => {
    const inputs = baseInputs();
    const result = reduceList(
      settled(inputs),
      { kind: 'scroll-to-end', animated: false },
      inputs,
    );
    // total 500 - viewport 200 = 300.
    expect(result.effects).toEqual([
      { kind: 'scroll-to', offset: 300, animated: false },
    ]);
  });

  it('scroll-to-item finds the item by identity and scrolls to it', () => {
    const inputs = baseInputs();
    const result = reduceList(
      settled(inputs),
      { kind: 'scroll-to-item', item: 'c', animated: true, viewPosition: 0 },
      inputs,
    );
    expect(result.effects).toEqual([
      { kind: 'scroll-to', offset: 200, animated: true },
    ]);
  });

  it('scroll-to-item no-ops when the item is absent', () => {
    const inputs = baseInputs();
    const result = reduceList(
      settled(inputs),
      { kind: 'scroll-to-item', item: 'zzz', animated: true, viewPosition: 0 },
      inputs,
    );
    expect(result.effects).toEqual([]);
  });

  it('scroll-to-index reports failure past the last measured cell without getItemLayout', () => {
    const inputs = baseInputs({ getItemLayout: undefined });
    const state = settled(inputs);
    const result = reduceList(
      state,
      {
        kind: 'scroll-to-index',
        index: 3,
        animated: true,
        viewPosition: 0,
        viewOffset: 0,
      },
      inputs,
    );
    expect(result.effects).toEqual([
      {
        kind: 'fire-scroll-to-index-failed',
        index: 3,
        highestMeasuredFrameIndex: -1,
        averageItemLength: 0,
      },
    ]);
  });

  // why: RN's scrollToIndex asserts the index is inside the data range BEFORE anything else, and a
  // caller that scrolls to a stale index must find out at the call site. Clamping silently lands the
  // list somewhere plausible instead, so the bug surfaces later as "the wrong row is on screen" with
  // nothing pointing back at the caller. Three separate invariants, not one, because "the list is
  // empty" and "the index is past the end" are different diagnoses (RN VirtualizedList.js ~165-178).
  describe('Negative — scroll-to-index outside the data range', () => {
    const scrollTo =
      (index: number, inputs: IListReducerInputs<string>) => (): unknown =>
        reduceList(
          settled(inputs),
          {
            kind: 'scroll-to-index',
            index,
            animated: true,
            viewPosition: 0,
            viewOffset: 0,
          },
          inputs,
        );

    it('rejects a negative index naming the minimum', () => {
      expect(scrollTo(-1, baseInputs())).toThrow(
        'scrollToIndex out of range: requested index -1 but minimum is 0',
      );
    });

    it('rejects any index when the list holds no items', () => {
      const empty = baseInputs({
        data: [],
        getItem: () => '',
        getItemCount: () => 0,
      });
      expect(scrollTo(0, empty)).toThrow(
        'scrollToIndex out of range: item length 0 but minimum is 1',
      );
    });

    it('rejects an index past the last item naming the valid range', () => {
      expect(scrollTo(9, baseInputs())).toThrow(
        'scrollToIndex out of range: requested index 9 is out of 0 to 4',
      );
    });

    // why: the range check must come FIRST. Without getItemLayout an out-of-range index would
    // otherwise fall into the onScrollToIndexFailed branch and be reported as a measurement problem,
    // which sends the reader looking at cell layout for what is a caller bug.
    it('rejects before reporting a measurement failure when getItemLayout is absent', () => {
      expect(scrollTo(9, baseInputs({ getItemLayout: undefined }))).toThrow(
        'scrollToIndex out of range: requested index 9 is out of 0 to 4',
      );
    });
  });

  it('scroll-to-index resolves the offset when getItemLayout places the cell', () => {
    const inputs = baseInputs();
    const result = reduceList(
      settled(inputs),
      {
        kind: 'scroll-to-index',
        index: 2,
        animated: false,
        viewPosition: 0,
        viewOffset: 0,
      },
      inputs,
    );
    expect(result.effects).toEqual([
      { kind: 'scroll-to', offset: 200, animated: false },
    ]);
  });

  // why: without getItemLayout the target must still resolve normally — the failure guard is only
  // for a target the list has never measured, not a blanket "no getItemLayout" rejection.
  it('scroll-to-index resolves normally without getItemLayout when the target was measured', () => {
    const inputs = baseInputs({ getItemLayout: undefined });
    const measuredOnce = reduceList(
      settled(inputs),
      { kind: 'measure', index: 0, length: 100 },
      inputs,
    ).state;
    const measuredState = stepTo(
      measuredOnce,
      { kind: 'measure', index: 1, length: 100 },
      inputs,
    );
    const result = reduceList(
      measuredState,
      {
        kind: 'scroll-to-index',
        index: 1,
        animated: true,
        viewPosition: 0,
        viewOffset: 0,
      },
      inputs,
    );
    expect(result.effects).toEqual([
      { kind: 'scroll-to', offset: 100, animated: true },
    ]);
  });
});

// buildOffsets walks the WHOLE list and allocates two count-length arrays plus an object per
// index, and deriveMetrics calls it on every scroll frame — 544 allocations per frame on the
// canary's PATH B list, for a table that with getItemLayout is identical frame to frame. The
// observable is ARRAY IDENTITY: a reused table is literally the same object, a recomputed one is
// not. Asserting identity rather than a call count keeps the test off the implementation's shape.
// buildOffsets walks the WHOLE list and allocates two count-length arrays plus an object per
// index, and deriveMetrics calls it on every scroll frame — 544 allocations per frame on the
// canary's PATH B list, for a table that with getItemLayout is identical frame to frame. The
// observable is ARRAY IDENTITY: a reused table is literally the same object, a recomputed one is
// not. Asserting identity rather than a call count keeps the test off the implementation's shape.
describe('the offset table is reused while nothing it depends on moves', () => {
  // A window only SLIDES when the data outruns the overscan. DATA is five items and the default
  // windowSize is 21 viewports, so the default inputs can never move `first` off 0 — the fixture
  // has to be big enough and the overscan small enough, or the test proves nothing.
  const LONG = Array.from({ length: 200 }, (_value, index) => `row-${index}`);

  function longInputs(
    over: Partial<IListReducerInputs<string>> = {},
  ): IListReducerInputs<string> {
    return baseInputs({
      data: LONG,
      getItem: (_data, index): string => LONG[index],
      getItemCount: (): number => LONG.length,
      windowSize: 1,
      maxToRenderPerBatch: 200,
      ...over,
    });
  }

  it('hands back the same arrays across scroll frames', () => {
    const inputs = longInputs();
    const first = settled(inputs);
    const offsets = first.metrics.offsets;
    const lengths = first.metrics.lengths;
    // Read NOW, not after the scrolls: reduceList mutates and returns the same state object, so
    // `first` and `scrolledAgain` are the same reference and a later read would compare a value
    // with itself.
    const firstIndexBefore = first.metrics.first;

    const scrolled = stepTo(first, { kind: 'scroll', offset: 4000 }, inputs);
    const scrolledAgain = stepTo(
      scrolled,
      { kind: 'scroll', offset: 8000 },
      inputs,
    );

    expect(scrolledAgain.metrics.offsets).toBe(offsets);
    expect(scrolledAgain.metrics.lengths).toBe(lengths);
    // The window still has to MOVE. A cache that also froze the window would satisfy the identity
    // checks above and break the list outright, which is what this assertion is here to catch.
    expect(scrolledAgain.metrics.first).toBeGreaterThan(firstIndexBefore);
  });

  it('rebuilds the table once a cell reports a new measurement', () => {
    // Without getItemLayout the table is derived from what the cells report, so a measurement is
    // exactly the input that must invalidate it.
    const inputs = longInputs({ getItemLayout: undefined });
    const first = settled(inputs);
    const offsets = first.metrics.offsets;

    const measured = stepTo(
      first,
      { kind: 'measure', index: 3, length: 140, offset: 420 },
      inputs,
    );

    expect(measured.metrics.offsets).not.toBe(offsets);
    expect(measured.metrics.lengths[3]).toBe(140);
  });

  it('rebuilds the table when the data identity changes', () => {
    const inputs = longInputs();
    const first = settled(inputs);
    const offsets = first.metrics.offsets;

    const grown = [...LONG, 'extra'];
    const next = stepTo(
      first,
      { kind: 'refresh-metrics' },
      longInputs({
        data: grown,
        getItem: (_data, index): string => grown[index],
        getItemCount: (): number => grown.length,
      }),
    );

    expect(next.metrics.offsets).not.toBe(offsets);
    expect(next.metrics.count).toBe(grown.length);
  });
});

describe('listEffectSignature', () => {
  it('changes when the window moves and stays put otherwise', () => {
    const inputs = baseInputs();
    const state = settled(inputs);
    const before = listEffectSignature(state);
    const scrolled = reduceList(
      state,
      { kind: 'scroll', offset: 300 },
      inputs,
    ).state;
    expect(listEffectSignature(scrolled)).not.toBe(before);
    const idle = reduceList(
      scrolled,
      { kind: 'record-interaction' },
      inputs,
    ).state;
    expect(listEffectSignature(idle)).toBe(listEffectSignature(scrolled));
  });
});

// The device bug this closes (iOS simulator, 2026-08-19): scrolling examples/solid's SectionList made
// the whole layout shift and shift back, and the scroll view's own contentSize.height swung by up to
// 165pt while the data never changed. Both symptoms are the offset table, and both scenarios below
// are Positive — the table has no throwing path.
describe('the offset table a list measures for itself', () => {
  // A list that measures its own cells: no getItemLayout, so every offset comes from onLayout.
  function measuringInputs(): IListReducerInputs<string> {
    return baseInputs({ getItemLayout: undefined });
  }

  function measure(
    state: IListState<string>,
    inputs: IListReducerInputs<string>,
    index: number,
    length: number,
    offset: number,
  ): void {
    reduceList(state, { kind: 'measure', index, length, offset }, inputs);
    reduceList(state, { kind: 'refresh-metrics' }, inputs);
  }

  // why: the list renders chrome BETWEEN cells — an ItemSeparatorComponent, a section gap — and that
  // chrome is part of the distance a spacer has to stand in for. A model built by summing heights is
  // short by exactly that, so every windowed-out region pulls the content below it upward.
  it('counts what the list renders between two cells, not just their heights', () => {
    const inputs = measuringInputs();
    const state = createInitialListState<string>();
    reduceList(state, { kind: 'layout', length: 200 }, inputs);
    // Five 40pt cells laid out 50pt apart: 10pt of separator sits in each gap.
    for (let index = 0; index < DATA.length; index += 1) {
      measure(state, inputs, index, 40, index * 50);
    }

    expect(state.metrics.offsets).toEqual([0, 50, 100, 150, 200]);
    expect(state.metrics.total, 'four gaps of 10pt are in there').toBe(240);
  });

  // why: flinging leaves cells that were never rendered, so never measured. Their length is a guess
  // off the running average, and that average keeps moving as real measurements arrive. A cell whose
  // real position IS known must not ride on that guess, or it slides back and forth under the user.
  it('holds a measured cell in place while an unmeasured neighbour is still a guess', () => {
    const inputs = measuringInputs();
    const state = createInitialListState<string>();
    reduceList(state, { kind: 'layout', length: 200 }, inputs);
    measure(state, inputs, 0, 40, 0);
    measure(state, inputs, 3, 40, 300);
    const pinned = state.metrics.offsets[3];

    // Index 1 turns out to be far taller than anything measured so far, which drags the average up.
    measure(state, inputs, 1, 400, 40);

    expect(pinned).toBe(300);
    expect(state.metrics.offsets[3], 'still where the host put it').toBe(300);
  });
});
