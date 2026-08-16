// No Negative group: reduceList is total over its IListAction union (a switch with no default/
// throw) — every action kind produces a state+effects pair, never a rejection. All scenarios below
// are Positive (successful transitions); an invalid `action.kind` is unreachable through the typed
// union, so there is no "must throw" case to invent.
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

function baseInputs(over: Partial<IListReducerInputs<string>> = {}): IListReducerInputs<string> {
  return {
    data: DATA,
    getItem: (_data, index): string => DATA[index],
    getItemCount: (): number => DATA.length,
    keyExtractor: undefined,
    getItemLayout: (_data, index) => ({ length: 100, offset: index * 100, index }),
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
function settled(inputs: IListReducerInputs<string>, viewport = 200): IListState<string> {
  return stepTo(createInitialListState<string>(), { kind: 'layout', length: viewport }, inputs);
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
    const rendered = reduceList(laid.state, { kind: 'refresh-metrics' }, inputs).state;
    expect(rendered.metrics.count).toBe(5);
    expect(rendered.metrics.total).toBe(500);
    expect(rendered.metrics.first).toBe(0);
    expect(rendered.metrics.last).toBe(4);
  });

  it('scroll records the offset and flips hasInteracted', () => {
    const inputs = baseInputs();
    const result = reduceList(settled(inputs), { kind: 'scroll', offset: 120 }, inputs);
    expect(result.changed).toBe(true);
    expect(result.state.scrollOffset).toBe(120);
    expect(result.state.hasInteracted).toBe(true);
  });

  it('measure is a no-op when getItemLayout owns cell sizes', () => {
    const inputs = baseInputs();
    const result = reduceList(settled(inputs), { kind: 'measure', index: 0, length: 42 }, inputs);
    expect(result.changed).toBe(false);
    expect(result.state.measured.size).toBe(0);
  });

  it('measure records a fresh length but dedups a repeat', () => {
    const inputs = baseInputs({ getItemLayout: undefined });
    const first = reduceList(settled(inputs), { kind: 'measure', index: 0, length: 30 }, inputs);
    expect(first.changed).toBe(true);
    expect(first.state.measured.get(0)).toBe(30);
    const repeat = reduceList(first.state, { kind: 'measure', index: 0, length: 30 }, inputs);
    expect(repeat.changed).toBe(false);
  });

  it('record-interaction flips the flag without a re-render', () => {
    const inputs = baseInputs();
    const result = reduceList(settled(inputs), { kind: 'record-interaction' }, inputs);
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
    const state = stepTo(settled(inputs), { kind: 'scroll', offset: 300 }, inputs);

    const first = reduceList(state, { kind: 'commit' }, inputs);
    expect(first.effects).toContainEqual({ kind: 'fire-end-reached', distanceFromEnd: 0 });

    const second = reduceList(first.state, { kind: 'commit' }, inputs);
    expect(second.effects.some(effect => effect.kind === 'fire-end-reached')).toBe(false);
  });

  it('stays silent when no onEndReached listener is active', () => {
    const inputs = baseInputs({ onEndReachedActive: false });
    const state = stepTo(settled(inputs), { kind: 'scroll', offset: 300 }, inputs);
    const result = reduceList(state, { kind: 'commit' }, inputs);
    expect(result.effects.some(effect => effect.kind === 'fire-end-reached')).toBe(false);
  });
});

describe('reduceList commit — onStartReached', () => {
  it('fires at the top edge when a listener is active, then dedups on the next commit', () => {
    const inputs = baseInputs({ onStartReachedActive: true });
    const state = settled(inputs);
    const first = reduceList(state, { kind: 'commit' }, inputs);
    expect(first.effects).toContainEqual({ kind: 'fire-start-reached', distanceFromStart: 0 });

    // why: onStartReached must fire once per content length, exactly like onEndReached — the
    // adapters used to independently re-derive this dedup and drift; a repeat commit at the same
    // edge must stay silent.
    const second = reduceList(first.state, { kind: 'commit' }, inputs);
    expect(second.effects.some(effect => effect.kind === 'fire-start-reached')).toBe(false);
  });

  // why: the mirror of onEndReached's "stays silent" case — no adapter callback is wired, so the
  // reducer must not compute or fire the edge event at all.
  it('stays silent when no onStartReached listener is active', () => {
    const inputs = baseInputs({ onStartReachedActive: false });
    const state = settled(inputs);
    const result = reduceList(state, { kind: 'commit' }, inputs);
    expect(result.effects.some(effect => effect.kind === 'fire-start-reached')).toBe(false);
  });
});

describe('reduceList commit — viewability', () => {
  it('emits fire-viewable for the newly visible cells, then dedups after viewable-fired', () => {
    const inputs = baseInputs({ viewabilityPairs: [noopViewablePair] });
    const state = settled(inputs);

    const first = reduceList(state, { kind: 'commit' }, inputs);
    const fired = first.effects.find(effect => effect.kind === 'fire-viewable');
    expect(fired).toBeDefined();
    if (fired?.kind !== 'fire-viewable') throw new Error('expected fire-viewable');
    expect(fired.delay).toBe(0);
    expect(fired.info.viewableItems.map(token => token.index)).toEqual([0, 1]);

    // Fold the fired set back, exactly as the adapter does once the (zero) debounce completes.
    const settledState = reduceList(
      first.state,
      { kind: 'viewable-fired', map: fired.map },
      inputs,
    ).state;
    const second = reduceList(settledState, { kind: 'commit' }, inputs);
    expect(second.effects.some(effect => effect.kind === 'fire-viewable')).toBe(false);
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
    const state = stepTo(settled(inputs, 100), { kind: 'scroll', offset: 300 }, inputs);
    const result = reduceList(state, { kind: 'commit' }, inputs);
    expect(result.state.metrics.last).toBeLessThan(result.state.metrics.target.last);
    expect(result.effects).toContainEqual({ kind: 'schedule-refill', delay: 50 });
  });
});

describe('reduceList commit — initialScrollIndex', () => {
  it('scrolls to the index once, then never again', () => {
    const inputs = baseInputs({ initialScrollIndex: 3 });
    const state = settled(inputs);
    const first = reduceList(state, { kind: 'commit' }, inputs);
    expect(first.effects).toContainEqual({ kind: 'scroll-to', offset: 300, animated: false });
    expect(first.state.appliedInitialScroll).toBe(true);
    const second = reduceList(first.state, { kind: 'commit' }, inputs);
    expect(second.effects.some(effect => effect.kind === 'scroll-to')).toBe(false);
  });
});

describe('reduceList commit — maintainVisibleContentPosition', () => {
  it('records the anchor key on the first commit without scrolling', () => {
    const inputs = baseInputs({ maintainVisibleContentPosition: { minIndexForVisible: 0 } });
    const state = settled(inputs);
    const result = reduceList(state, { kind: 'commit' }, inputs);
    expect(result.state.firstVisibleKey).toBe('0');
    expect(result.effects.some(effect => effect.kind === 'scroll-to')).toBe(false);
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
    expect(result.effects).toEqual([{ kind: 'scroll-to', offset: 250, animated: true }]);
  });

  it('scroll-to-end resolves the bottom offset', () => {
    const inputs = baseInputs();
    const result = reduceList(settled(inputs), { kind: 'scroll-to-end', animated: false }, inputs);
    // total 500 - viewport 200 = 300.
    expect(result.effects).toEqual([{ kind: 'scroll-to', offset: 300, animated: false }]);
  });

  it('scroll-to-item finds the item by identity and scrolls to it', () => {
    const inputs = baseInputs();
    const result = reduceList(
      settled(inputs),
      { kind: 'scroll-to-item', item: 'c', animated: true, viewPosition: 0 },
      inputs,
    );
    expect(result.effects).toEqual([{ kind: 'scroll-to', offset: 200, animated: true }]);
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
      { kind: 'scroll-to-index', index: 3, animated: true, viewPosition: 0, viewOffset: 0 },
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

  it('scroll-to-index resolves the offset when getItemLayout places the cell', () => {
    const inputs = baseInputs();
    const result = reduceList(
      settled(inputs),
      { kind: 'scroll-to-index', index: 2, animated: false, viewPosition: 0, viewOffset: 0 },
      inputs,
    );
    expect(result.effects).toEqual([{ kind: 'scroll-to', offset: 200, animated: false }]);
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
    const measuredState = stepTo(measuredOnce, { kind: 'measure', index: 1, length: 100 }, inputs);
    const result = reduceList(
      measuredState,
      { kind: 'scroll-to-index', index: 1, animated: true, viewPosition: 0, viewOffset: 0 },
      inputs,
    );
    expect(result.effects).toEqual([{ kind: 'scroll-to', offset: 100, animated: true }]);
  });
});

describe('listEffectSignature', () => {
  it('changes when the window moves and stays put otherwise', () => {
    const inputs = baseInputs();
    const state = settled(inputs);
    const before = listEffectSignature(state);
    const scrolled = reduceList(state, { kind: 'scroll', offset: 300 }, inputs).state;
    expect(listEffectSignature(scrolled)).not.toBe(before);
    const idle = reduceList(scrolled, { kind: 'record-interaction' }, inputs).state;
    expect(listEffectSignature(idle)).toBe(listEffectSignature(scrolled));
  });
});
