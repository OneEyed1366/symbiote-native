import { describe, it, expect } from 'vitest';
import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  computeMvcpAdjustment,
  resolveItemKey,
  indexOfItem,
  offsetForEnd,
  isSeparatorGapInRange,
  decideEdgeReached,
  resolveStickySectionHeaders,
  wrapFixedLayout,
  resolveAverageLength,
  buildListPlan,
  readScrollOffset,
  readLayoutLength,
  buildOffsets,
  computeWindow,
  throttleWindow,
  visiblePercent,
  isCellViewable,
  offsetForIndex,
  averageMeasuredLength,
  highestMeasuredIndex,
  computeEndReached,
  computeStartReached,
  buildViewabilityPairs,
  computeViewableSet,
  diffViewable,
  maxMinimumViewTime,
  NO_INDEX,
  DEFAULT_VIEW_AREA_COVERAGE_PERCENT_THRESHOLD,
  type ICellLayout,
  type IViewToken,
  type IViewabilityConfigCallbackPair,
} from './virtualized-list';

// why: every symbol below is a pure computation with no throwing path (no `throw` in
// virtualized-list.ts) — there is no Negative group to write here. Boundaries that must
// still succeed (empty list, zero viewport, missing config) are covered as Positive cases.

function nativeEventFor(payload: Record<string, unknown>): ISymbioteEvent {
  const target = createElement('RCTView');
  return {
    type: 'topScroll',
    target,
    currentTarget: target,
    nativeEvent: payload,
    stopPropagation: () => {},
  };
}

// keyFor over a fixed key array (index -> key), the adapter's keyForIndex twin.
const keyForOf =
  (keys: string[]) =>
  (index: number): string =>
    keys[index] ?? String(index);
// uniform 100px cells: offsets[i] = i*100.
const uniformOffsets = (n: number): number[] => Array.from({ length: n }, (_value, i) => i * 100);

describe('computeMvcpAdjustment', () => {
  it('no-ops with MVCP off (minIndexForVisible undefined)', () => {
    const result = computeMvcpAdjustment({
      minIndexForVisible: undefined,
      autoscrollToTopThreshold: undefined,
      count: 5,
      committedFirst: 0,
      offsets: uniformOffsets(5),
      scrollOffset: 0,
      prevFirstVisibleKey: 'a',
      keyFor: keyForOf(['a', 'b', 'c', 'd', 'e']),
    });
    expect(result).toEqual({ firstVisibleKey: null, action: { kind: 'none' } });
  });

  it('no-ops on an empty list', () => {
    const result = computeMvcpAdjustment({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: undefined,
      count: 0,
      committedFirst: 0,
      offsets: [],
      scrollOffset: 0,
      prevFirstVisibleKey: null,
      keyFor: keyForOf([]),
    });
    expect(result).toEqual({ firstVisibleKey: null, action: { kind: 'none' } });
  });

  it('first pass records the anchor key without acting', () => {
    const result = computeMvcpAdjustment({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: undefined,
      count: 3,
      committedFirst: 0,
      offsets: uniformOffsets(3),
      scrollOffset: 0,
      prevFirstVisibleKey: null,
      keyFor: keyForOf(['a', 'b', 'c']),
    });
    expect(result).toEqual({ firstVisibleKey: 'a', action: { kind: 'none' } });
  });

  it('no-ops when the anchor key is unchanged', () => {
    const result = computeMvcpAdjustment({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: undefined,
      count: 3,
      committedFirst: 0,
      offsets: uniformOffsets(3),
      scrollOffset: 50,
      prevFirstVisibleKey: 'a',
      keyFor: keyForOf(['a', 'b', 'c']),
    });
    expect(result).toEqual({ firstVisibleKey: 'a', action: { kind: 'none' } });
  });

  it('shifts by the inserted spacer extent on a prepend below a scrolled window', () => {
    // 'a' was at index 0; a 2-item prepend pushed it to index 2, window scrolled (committedFirst=2).
    const result = computeMvcpAdjustment({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: undefined,
      count: 5,
      committedFirst: 2,
      offsets: uniformOffsets(5),
      scrollOffset: 500,
      prevFirstVisibleKey: 'a',
      keyFor: keyForOf(['x', 'y', 'a', 'b', 'c']),
    });
    // spacerEnd = min(2,2)=2; insertedExtent = offsets[2]-offsets[0] = 200; shift = 500+200.
    expect(result).toEqual({ firstVisibleKey: 'x', action: { kind: 'shift', offset: 700 } });
  });

  it('autoscrolls to top when the anchor sits within the threshold', () => {
    const result = computeMvcpAdjustment({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: 10,
      count: 5,
      committedFirst: 2,
      offsets: uniformOffsets(5),
      scrollOffset: 5,
      prevFirstVisibleKey: 'a',
      keyFor: keyForOf(['x', 'y', 'a', 'b', 'c']),
    });
    expect(result).toEqual({ firstVisibleKey: 'x', action: { kind: 'autoscroll-top' } });
  });

  it('no-ops when the prepend stays inside the committed window (native MVCP owns it)', () => {
    // committedFirst=0: the whole prepend is in-window; JS must not double-correct.
    const result = computeMvcpAdjustment({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: undefined,
      count: 5,
      committedFirst: 0,
      offsets: uniformOffsets(5),
      scrollOffset: 0,
      prevFirstVisibleKey: 'a',
      keyFor: keyForOf(['x', 'y', 'a', 'b', 'c']),
    });
    // spacerEnd = min(2,0)=0; insertedExtent 0 → none.
    expect(result).toEqual({ firstVisibleKey: 'x', action: { kind: 'none' } });
  });

  // why: a filtered/truncated data set can shrink below minIndexForVisible — there is no anchor
  // cell to track anymore, so MVCP must go fully idle rather than reading past the end of `count`.
  it('reports no anchor key once the list shrinks to or below minIndexForVisible', () => {
    const result = computeMvcpAdjustment({
      minIndexForVisible: 2,
      autoscrollToTopThreshold: undefined,
      count: 2,
      committedFirst: 0,
      offsets: uniformOffsets(2),
      scrollOffset: 0,
      prevFirstVisibleKey: 'a',
      keyFor: keyForOf(['a', 'b']),
    });
    expect(result).toEqual({ firstVisibleKey: null, action: { kind: 'none' } });
  });

  // why: the previous anchor item was removed outright (not just shifted) — keyFor can no longer
  // find it in [minIndexForVisible, count), so there is nothing to shift by and MVCP must not guess.
  it('does not shift when the previous anchor item was removed from the data entirely', () => {
    const result = computeMvcpAdjustment({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: undefined,
      count: 3,
      committedFirst: 0,
      offsets: uniformOffsets(3),
      scrollOffset: 300,
      prevFirstVisibleKey: 'gone',
      keyFor: keyForOf(['x', 'y', 'z']),
    });
    expect(result).toEqual({ firstVisibleKey: 'x', action: { kind: 'none' } });
  });
});

describe('resolveItemKey', () => {
  it('uses the keyExtractor when provided', () => {
    expect(resolveItemKey({ id: 'a' }, 3, item => item.id)).toBe('a');
  });
  it('falls back to the stringified index', () => {
    expect(resolveItemKey({ id: 'a' }, 3, undefined)).toBe('3');
  });
});

describe('indexOfItem', () => {
  const items = ['a', 'b', 'c'];
  const getItem = (_data: unknown, index: number): unknown => items[index];
  it('finds the index by reference identity', () => {
    expect(indexOfItem(items, getItem, 3, 'b')).toBe(1);
  });
  it('returns NO_INDEX (-1) when the item is absent', () => {
    expect(indexOfItem(items, getItem, 3, 'z')).toBe(-1);
  });
});

describe('offsetForEnd', () => {
  it('scrolls the content to the bottom edge', () => {
    expect(offsetForEnd(1000, 300)).toBe(700);
  });
  it('never goes negative when content is shorter than the viewport', () => {
    expect(offsetForEnd(200, 300)).toBe(0);
  });
});

describe('isSeparatorGapInRange', () => {
  it('accepts gaps inside [0, count-2]', () => {
    expect(isSeparatorGapInRange(0, 3)).toBe(true);
    expect(isSeparatorGapInRange(1, 3)).toBe(true);
  });
  it('rejects gaps below 0 or past the last gap', () => {
    expect(isSeparatorGapInRange(-1, 3)).toBe(false);
    expect(isSeparatorGapInRange(2, 3)).toBe(false);
  });
});

describe('decideEdgeReached', () => {
  it('fires once when within threshold, edge rendered, and not yet sent for this length', () => {
    expect(
      decideEdgeReached({
        withinThreshold: true,
        edgeCellRendered: true,
        total: 500,
        sentForContentLength: -1,
      }),
    ).toEqual({ shouldFire: true, nextSentForContentLength: 500 });
  });
  it('does not re-fire for the same content length (dedup)', () => {
    expect(
      decideEdgeReached({
        withinThreshold: true,
        edgeCellRendered: true,
        total: 500,
        sentForContentLength: 500,
      }),
    ).toEqual({ shouldFire: false, nextSentForContentLength: 500 });
  });
  it('does not fire when the edge cell is not rendered, leaving the sentinel untouched', () => {
    expect(
      decideEdgeReached({
        withinThreshold: true,
        edgeCellRendered: false,
        total: 500,
        sentForContentLength: -1,
      }),
    ).toEqual({ shouldFire: false, nextSentForContentLength: -1 });
  });
  it('re-arms when scrolled out of threshold', () => {
    expect(
      decideEdgeReached({
        withinThreshold: false,
        edgeCellRendered: false,
        total: 500,
        sentForContentLength: 500,
      }),
    ).toEqual({ shouldFire: false, nextSentForContentLength: -1 });
  });
});

describe('resolveStickySectionHeaders', () => {
  it('sticks by default on iOS', () => {
    expect(resolveStickySectionHeaders(undefined, [0, 4], 'ios')).toEqual([0, 4]);
  });
  it('does not stick by default off iOS', () => {
    expect(resolveStickySectionHeaders(undefined, [0, 4], 'android')).toBeUndefined();
  });
  it('honors the explicit prop over the platform default', () => {
    expect(resolveStickySectionHeaders(false, [0, 4], 'ios')).toBeUndefined();
    expect(resolveStickySectionHeaders(true, [0, 4], 'android')).toEqual([0, 4]);
  });
});

describe('buildListPlan', () => {
  // 20 uniform 100px cells (offsets[i] = i*100), sticky section headers at index 0 and 10 —
  // mirrors the SectionList repro (Fruit@0, Tools@10) that vanished on-device once scrolling
  // carried the window past a section's origin index.
  const offsets = uniformOffsets(20);
  const lengths = Array.from({ length: 20 }, () => 100);
  const keyFor = keyForOf(offsets.map((_o, i) => String(i)));

  it('force-mounts the nearest sticky index below the window, RN _ensureClosestStickyHeader-style', () => {
    const plan = buildListPlan({
      count: 20,
      first: 6,
      last: 15,
      offsets,
      lengths,
      total: 2000,
      keyFor,
      stickyIndices: new Set([0, 10]),
      hasHeader: false,
      hasSeparators: false,
    });
    // The section-0 header must stay a distinct, force-mounted cell even though index 0 is
    // long out of [first,last] — NOT silently dropped from plan.cells (which is what
    // destroyed/recreated the adapter's sticky component every re-entry into the window).
    expect(plan.forcedStickyCell).toEqual({ index: 0, key: '0' });
    expect(plan.cells.map(c => c.index)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    // Space before the forced cell (it sits at offset 0) plus the gap between it and the
    // window's own first cell (offsets[6] - offsets[0] - lengths[0]).
    expect(plan.leadingExtent).toBe(0);
    expect(plan.gapExtent).toBe(500);
    expect(plan.trailingExtent).toBe(400);
    // Position 0 is the forced cell; position 6 is index 10, still correctly sticky inside
    // the window (header absent, leading spacer absent, forced cell + its gap spacer = +2).
    expect(plan.stickyChildPositions).toEqual([0, 6]);
  });

  it('matches the old single-window shape when no sticky index precedes the window', () => {
    const plan = buildListPlan({
      count: 20,
      first: 0,
      last: 9,
      offsets,
      lengths,
      total: 2000,
      keyFor,
      stickyIndices: new Set([0, 10]),
      hasHeader: false,
      hasSeparators: false,
    });
    expect(plan.forcedStickyCell).toBeUndefined();
    expect(plan.gapExtent).toBe(0);
    expect(plan.leadingExtent).toBe(0);
    expect(plan.cells.map(c => c.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(plan.stickyChildPositions).toEqual([0]);
  });

  it('does not force-mount a sticky index that is already inside the window', () => {
    const plan = buildListPlan({
      count: 20,
      first: 8,
      last: 12,
      offsets,
      lengths,
      total: 2000,
      keyFor,
      stickyIndices: new Set([10]),
      hasHeader: false,
      hasSeparators: false,
    });
    expect(plan.forcedStickyCell).toBeUndefined();
    expect(plan.gapExtent).toBe(0);
  });

  // why: ListHeaderComponent occupies child position 0 ahead of every spacer/cell — every
  // sticky-position and spacer index downstream must shift by one to account for it, or the
  // adapter would mount the sticky child one slot too early and clobber the header.
  it('shifts every child position by one when a ListHeaderComponent is present', () => {
    const plan = buildListPlan({
      count: 20,
      first: 0,
      last: 9,
      offsets,
      lengths,
      total: 2000,
      keyFor,
      stickyIndices: new Set([0]),
      hasHeader: true,
      hasSeparators: false,
    });
    expect(plan.stickyChildPositions).toEqual([1]);
  });

  // why: ItemSeparatorComponent inserts one extra child between every pair of adjacent cells
  // (never after the last cell) — a sticky index past the first cell must count those gap
  // children too, or the adapter would target the wrong emitted child for pinning.
  it('accounts for one separator child between every cell pair when hasSeparators is set', () => {
    const plan = buildListPlan({
      count: 20,
      first: 8,
      last: 12,
      offsets,
      lengths,
      total: 2000,
      keyFor,
      stickyIndices: new Set([10]),
      hasHeader: false,
      hasSeparators: true,
    });
    // Leading spacer (child 0) + cells 8,9 each followed by a separator child (4 children) puts
    // index 10 — the 3rd cell in the window — at child position 5.
    expect(plan.stickyChildPositions).toEqual([5]);
  });
});

describe('wrapFixedLayout', () => {
  it('returns undefined without getItemLayout', () => {
    expect(wrapFixedLayout([], undefined)).toBeUndefined();
  });
  it('wraps getItemLayout into an (index) => ICellLayout, dropping the index field', () => {
    const getItemLayout = (_data: unknown, index: number) => ({
      length: 10,
      offset: index * 10,
      index,
    });
    const fixed = wrapFixedLayout(['a', 'b'], getItemLayout);
    expect(fixed?.(1)).toEqual({ length: 10, offset: 10 });
  });
});

describe('resolveAverageLength', () => {
  const measured = new Map([
    [0, 20],
    [1, 40],
  ]);
  it('averages the measured cells when there is no fixed layout', () => {
    expect(resolveAverageLength(undefined, 2, measured)).toBe(30);
  });
  it('uses the first fixed cell length when getItemLayout is set', () => {
    const fixed = (): ICellLayout => ({ length: 50, offset: 0 });
    expect(resolveAverageLength(fixed, 3, measured)).toBe(50);
  });
  it('guards an empty list (count 0) instead of touching a missing cell', () => {
    const fixed = (): ICellLayout => {
      throw new Error('must not touch a cell on an empty list');
    };
    expect(resolveAverageLength(fixed, 0, measured)).toBe(0);
  });
});

describe('readScrollOffset', () => {
  // why: onScroll reads the axis-appropriate field off contentOffset — reading the wrong axis
  // would size the window from a value that never changes while the user actually scrolls.
  it('reads contentOffset.y for a vertical list', () => {
    const event = nativeEventFor({ contentOffset: { x: 5, y: 120 } });
    expect(readScrollOffset(event, false)).toBe(120);
  });

  it('reads contentOffset.x for a horizontal list', () => {
    const event = nativeEventFor({ contentOffset: { x: 5, y: 120 } });
    expect(readScrollOffset(event, true)).toBe(5);
  });

  // why: a native event payload is untyped `unknown` off the bridge — a malformed or partial
  // payload must degrade to "no offset available", never crash the reducer reading it.
  it('returns undefined when nativeEvent carries no contentOffset', () => {
    expect(readScrollOffset(nativeEventFor({}), false)).toBeUndefined();
  });

  it('returns undefined when contentOffset.y is not a number', () => {
    const event = nativeEventFor({ contentOffset: { y: 'oops' } });
    expect(readScrollOffset(event, false)).toBeUndefined();
  });
});

describe('readLayoutLength', () => {
  // why: onLayout reads the axis-appropriate box dimension — the cross-section length used to
  // size the viewport window must track the scroll axis, not the perpendicular one.
  it('reads layout.height for a vertical list', () => {
    const event = nativeEventFor({ layout: { width: 300, height: 640 } });
    expect(readLayoutLength(event, false)).toBe(640);
  });

  it('reads layout.width for a horizontal list', () => {
    const event = nativeEventFor({ layout: { width: 300, height: 640 } });
    expect(readLayoutLength(event, true)).toBe(300);
  });

  it('returns undefined when nativeEvent carries no layout', () => {
    expect(readLayoutLength(nativeEventFor({}), false)).toBeUndefined();
  });
});

describe('buildOffsets', () => {
  // why: the offset table is a running sum of lengths — a bug here misplaces every cell after
  // the first unmeasured one, since every downstream index depends on the accumulated total.
  it('accumulates offsets as a running sum and fills unmeasured cells with the average', () => {
    const measured = new Map([[0, 50]]);
    const result = buildOffsets(3, measured, undefined, 20);
    // cell 0 measured (50), cells 1 and 2 fall back to the 20px average.
    expect(result).toEqual({ offsets: [0, 50, 70], lengths: [50, 20, 20], total: 90 });
  });

  // why: when the caller supplies getItemLayout, its length is authoritative for every cell —
  // the measured cache and average must never override a fixed layout.
  it('uses the fixed layout length for every cell when getItemLayout is provided', () => {
    const fixedLayout = (index: number): ICellLayout => ({ length: 15 + index, offset: 0 });
    const result = buildOffsets(3, new Map(), fixedLayout, 999);
    expect(result).toEqual({ offsets: [0, 15, 31], lengths: [15, 16, 17], total: 48 });
  });

  it('returns an empty table with zero total for an empty list', () => {
    expect(buildOffsets(0, new Map(), undefined, 0)).toEqual({
      offsets: [],
      lengths: [],
      total: 0,
    });
  });
});

describe('computeWindow', () => {
  // why: an empty list has no window to render — first/last must resolve to the documented
  // empty-range sentinel (last < first), not an out-of-bounds index.
  it('resolves an empty window on an empty list', () => {
    expect(computeWindow(0, [], [], 0, 500, 21, 10)).toEqual({ first: 0, last: NO_INDEX });
  });

  // why: before the first onLayout, the viewport length is unknown — painting a bounded prefix
  // (rather than nothing, or the full list) matches RN's initial-render contract.
  it('paints a bounded initial prefix before the viewport is measured', () => {
    const offsets = uniformOffsets(20);
    const lengths = Array.from({ length: 20 }, () => 100);
    expect(computeWindow(20, offsets, lengths, 0, 0, 21, 10)).toEqual({ first: 0, last: 9 });
  });

  it('clamps the initial prefix to the list length when it is shorter than initialNumToRender', () => {
    const offsets = uniformOffsets(5);
    const lengths = Array.from({ length: 5 }, () => 100);
    expect(computeWindow(5, offsets, lengths, 0, 0, 21, 10)).toEqual({ first: 0, last: 4 });
  });

  // why: the resident window is every cell whose box overlaps [scrollOffset - overscan,
  // scrollOffset + viewport + overscan] — this is the core windowing contract every adapter
  // relies on to avoid mounting the whole list.
  it('centers the window on the scroll offset with symmetric overscan', () => {
    const offsets = uniformOffsets(50);
    const lengths = Array.from({ length: 50 }, () => 100);
    // viewport 500px, windowSize 3 => overscan = (3-1)/2 * 500 = 500px each side.
    // scrolled to 2000: window = [1500, 3000] => cells whose box overlaps that range.
    const window = computeWindow(50, offsets, lengths, 2000, 500, 3, 10);
    expect(window).toEqual({ first: 15, last: 29 });
  });
});

describe('throttleWindow', () => {
  // why: throttleWindow only clamps growth off a REAL previous window — the sentinel empty
  // window (last < first, before anything has rendered) must pass the target through unchanged
  // or the very first paint would be throttled down to nothing.
  it('passes the target through unchanged when there is no previous window yet', () => {
    const target = { first: 0, last: 19 };
    expect(throttleWindow(target, { first: 0, last: NO_INDEX }, 10)).toEqual(target);
  });

  // why: incremental fill grows the window by at most maxToRenderPerBatch cells per side per
  // tick — a big jump (e.g. scrollToEnd) must not snap the whole target window in at once.
  it('clamps growth to maxToRenderPerBatch cells on each side', () => {
    const target = { first: 0, last: 100 };
    const previous = { first: 20, last: 30 };
    expect(throttleWindow(target, previous, 5)).toEqual({ first: 15, last: 35 });
  });

  // why: clamping symmetric growth on a target window narrower than the previous one can cross
  // first > last (an empty window) — falling back to the full target avoids ever presenting a
  // window with nothing in it while cells clearly should render.
  it('falls back to the target when clamping would cross into an empty window', () => {
    const target = { first: 40, last: 42 };
    const previous = { first: 0, last: 1 };
    expect(throttleWindow(target, previous, 2)).toEqual(target);
  });
});

describe('visiblePercent', () => {
  it('reports 0 for a zero-length cell', () => {
    expect(visiblePercent(100, 0, 0, 500)).toBe(0);
  });

  it('reports 100 when the cell is fully inside the viewport', () => {
    expect(visiblePercent(100, 50, 0, 500)).toBe(100);
  });

  // why: viewability is a FRACTION of the cell's own box that is visible — a cell straddling
  // the viewport edge is genuinely partially viewable, not simply in-or-out.
  it('reports the overlapping fraction for a cell straddling the viewport edge', () => {
    // cell [450, 550), viewport [0, 500): 50 of 100px visible.
    expect(visiblePercent(450, 100, 0, 500)).toBe(50);
  });

  it('reports 0 for a cell entirely outside the viewport', () => {
    expect(visiblePercent(1000, 100, 0, 500)).toBe(0);
  });
});

describe('isCellViewable', () => {
  // why: itemVisiblePercentThreshold takes precedence over the area threshold when both would
  // otherwise apply (RN's documented precedence) — mixing them up flips which cells report.
  it('honors itemVisiblePercentThreshold over the area threshold when both are set', () => {
    expect(
      isCellViewable(60, { itemVisiblePercentThreshold: 50, viewAreaCoveragePercentThreshold: 90 }),
    ).toBe(true);
  });

  it('rejects a cell below itemVisiblePercentThreshold', () => {
    expect(isCellViewable(40, { itemVisiblePercentThreshold: 50 })).toBe(false);
  });

  it('falls back to viewAreaCoveragePercentThreshold when no item threshold is set', () => {
    expect(isCellViewable(30, { viewAreaCoveragePercentThreshold: 20 })).toBe(true);
    expect(isCellViewable(10, { viewAreaCoveragePercentThreshold: 20 })).toBe(false);
  });

  // why: a cell exactly filling the viewport must count as viewable even against a stricter
  // area threshold — RN's `percent >= 100` escape hatch on top of the coverage comparison.
  it('always counts a fully visible cell as viewable regardless of the area threshold', () => {
    expect(isCellViewable(100, { viewAreaCoveragePercentThreshold: 150 })).toBe(true);
  });

  it('uses the documented zero default when no threshold is configured at all', () => {
    expect(isCellViewable(0, {})).toBe(false);
    expect(isCellViewable(DEFAULT_VIEW_AREA_COVERAGE_PERCENT_THRESHOLD + 1, {})).toBe(true);
  });
});

describe('offsetForIndex', () => {
  const offsets = uniformOffsets(10);
  const lengths = Array.from({ length: 10 }, () => 100);

  it('clamps an out-of-range index to the last cell', () => {
    expect(offsetForIndex(999, 0, 0, 10, offsets, lengths, 500)).toBe(offsets[9]);
  });

  it('aligns the cell to the viewport top with viewPosition 0', () => {
    expect(offsetForIndex(5, 0, 0, 10, offsets, lengths, 500)).toBe(500);
  });

  // why: viewPosition biases where in the viewport the target lands (RN scrollToIndex) — 1
  // aligns the cell's bottom edge to the viewport bottom, a materially different offset than
  // aligning its top, so the bias must actually shift the result.
  it('aligns the cell to the viewport bottom with viewPosition 1', () => {
    // cellOffset 500, viewport 500, cell 100: positioned = 500 - 1*(500-100) = 100.
    expect(offsetForIndex(5, 1, 0, 10, offsets, lengths, 500)).toBe(100);
  });

  it('nudges the result by viewOffset', () => {
    expect(offsetForIndex(5, 0, 30, 10, offsets, lengths, 500)).toBe(470);
  });

  it('never returns a negative offset even when the bias would push it below zero', () => {
    expect(offsetForIndex(0, 1, 0, 10, offsets, lengths, 500)).toBe(0);
  });
});

describe('averageMeasuredLength', () => {
  it('reports 0 with no measured cells', () => {
    expect(averageMeasuredLength(new Map())).toBe(0);
  });

  it('averages the measured cell lengths', () => {
    expect(averageMeasuredLength(new Map([[0, 20], [1, 40], [2, 60]]))).toBe(40);
  });
});

describe('highestMeasuredIndex', () => {
  it('reports NO_INDEX with nothing measured', () => {
    expect(highestMeasuredIndex(new Map())).toBe(NO_INDEX);
  });

  // why: measurement arrives out of order (cells scroll into view non-sequentially) — the
  // result must be the max KEY, not the last-inserted entry.
  it('reports the highest measured index regardless of insertion order', () => {
    expect(highestMeasuredIndex(new Map([[5, 10], [2, 10], [8, 10], [1, 10]]))).toBe(8);
  });
});

describe('computeEndReached / computeStartReached', () => {
  it('reports the remaining distance to the end and whether it clears the threshold', () => {
    // total 1000, viewport 500 at offset 400 -> distanceFromEnd = 100; threshold = 1*500 = 500.
    expect(computeEndReached(1000, 400, 500, 1)).toEqual({
      distanceFromEnd: 100,
      withinThreshold: true,
    });
  });

  it('reports out of threshold when far from the end', () => {
    expect(computeEndReached(10_000, 0, 500, 1)).toEqual({
      distanceFromEnd: 9_500,
      withinThreshold: false,
    });
  });

  // why: RN floors a sub-pixel overshoot to exactly 0 so a debounced scroll that stops a
  // fraction of a pixel short of the true end still reads as "reached the end".
  it('floors a sub-epsilon end distance to exactly 0', () => {
    expect(computeEndReached(500.0002, 0, 500, 1).distanceFromEnd).toBe(0);
  });

  it('reports the scroll offset as the distance from the start', () => {
    expect(computeStartReached(120, 500, 1)).toEqual({
      distanceFromStart: 120,
      withinThreshold: true,
    });
  });

  it('floors a sub-epsilon start distance to exactly 0', () => {
    expect(computeStartReached(0.0002, 500, 1).distanceFromStart).toBe(0);
  });
});

describe('buildViewabilityPairs', () => {
  it('produces an empty list when neither the single-config callback nor pairs are set', () => {
    expect(buildViewabilityPairs(undefined, undefined, undefined)).toEqual([]);
  });

  // why: the single onViewableItemsChanged/viewabilityConfig prop pair is RN's shorthand form —
  // it must fold into the SAME pair-list shape the multi-pair form uses, defaulting a missing
  // config to {} so callers never branch on which form was used.
  it('folds the single-config callback into a pair with a default empty config', () => {
    const callback = (): void => {};
    expect(buildViewabilityPairs(callback, undefined, undefined)).toEqual([
      { viewabilityConfig: {}, onViewableItemsChanged: callback },
    ]);
  });

  it('appends the explicit pairs array after the single-config pair', () => {
    const single = (): void => {};
    const paired = (): void => {};
    const pairs = [{ viewabilityConfig: { minimumViewTime: 100 }, onViewableItemsChanged: paired }];
    expect(buildViewabilityPairs(single, undefined, pairs)).toEqual([
      { viewabilityConfig: {}, onViewableItemsChanged: single },
      pairs[0],
    ]);
  });
});

describe('computeViewableSet', () => {
  const data = ['a', 'b', 'c'];
  const getItem = (_source: unknown, index: number): string => data[index];

  function pairsWith(config: Parameters<typeof isCellViewable>[1]): IViewabilityConfigCallbackPair<string>[] {
    return [{ viewabilityConfig: config, onViewableItemsChanged: () => {} }];
  }

  // why: only cells inside [first,last] are classified at all — the geometry outside the
  // rendered window is irrelevant to viewability, no matter how it would score.
  it('classifies only cells within the rendered [first,last] window', () => {
    const { tokens } = computeViewableSet({
      first: 0,
      last: 1,
      count: 3,
      offsets: [0, 100, 200],
      lengths: [100, 100, 100],
      scrollOffset: 0,
      viewportLength: 300,
      data,
      getItem,
      pairs: pairsWith({ itemVisiblePercentThreshold: 50 }),
      hasInteracted: true,
    });
    expect(tokens.map(token => token.index)).toEqual([0, 1]);
  });

  // why: a cell counts as viewable if ANY configured pair says so (RN's broadest
  // classification) — a cell failing one config must still surface if another config accepts it.
  it('counts a cell viewable when ANY of several configs accepts it', () => {
    const failing = { itemVisiblePercentThreshold: 200 };
    const passing = { itemVisiblePercentThreshold: 10 };
    const { tokens } = computeViewableSet({
      first: 0,
      last: 0,
      count: 1,
      offsets: [0],
      lengths: [100],
      scrollOffset: 0,
      viewportLength: 300,
      data,
      getItem,
      pairs: [
        { viewabilityConfig: failing, onViewableItemsChanged: () => {} },
        { viewabilityConfig: passing, onViewableItemsChanged: () => {} },
      ],
      hasInteracted: true,
    });
    expect(tokens).toHaveLength(1);
  });

  // why: waitForInteraction gates a config to report NOTHING until the user has actually
  // scrolled — an initial paint must not fire viewability callbacks the user never triggered.
  it('excludes a waitForInteraction config until the first interaction', () => {
    const { tokens } = computeViewableSet({
      first: 0,
      last: 0,
      count: 1,
      offsets: [0],
      lengths: [100],
      scrollOffset: 0,
      viewportLength: 300,
      data,
      getItem,
      pairs: pairsWith({ itemVisiblePercentThreshold: 10, waitForInteraction: true }),
      hasInteracted: false,
    });
    expect(tokens).toEqual([]);
  });

  it('keys tokens by keyExtractor when provided, else by stringified index', () => {
    const { tokens: withExtractor } = computeViewableSet({
      first: 0,
      last: 0,
      count: 1,
      offsets: [0],
      lengths: [100],
      scrollOffset: 0,
      viewportLength: 300,
      data,
      getItem,
      keyExtractor: item => `item-${item}`,
      pairs: pairsWith({ itemVisiblePercentThreshold: 10 }),
      hasInteracted: true,
    });
    expect(withExtractor[0]?.key).toBe('item-a');

    const { tokens: withoutExtractor } = computeViewableSet({
      first: 0,
      last: 0,
      count: 1,
      offsets: [0],
      lengths: [100],
      scrollOffset: 0,
      viewportLength: 300,
      data,
      getItem,
      pairs: pairsWith({ itemVisiblePercentThreshold: 10 }),
      hasInteracted: true,
    });
    expect(withoutExtractor[0]?.key).toBe('0');
  });
});

describe('diffViewable', () => {
  const tokenFor = (key: string, index: number): IViewToken<string> => ({
    item: key,
    key,
    index,
    isViewable: true,
  });

  it('reports no change when the viewable key set is identical', () => {
    const previous = new Map([['a', tokenFor('a', 0)]]);
    const current = new Map([['a', tokenFor('a', 0)]]);
    expect(diffViewable(previous, current, [tokenFor('a', 0)])).toEqual({
      changed: [],
      hasChanged: false,
    });
  });

  // why: the changed list must carry BOTH directions — newly viewable cells (isViewable true)
  // AND cells that just scrolled out (isViewable false) — a consumer relying on only one
  // direction would leak stale "still viewable" entries for cells no longer on screen.
  it('reports newly viewable and newly hidden tokens on both sides of the diff', () => {
    const previous = new Map([['a', tokenFor('a', 0)]]);
    const currentTokens = [tokenFor('b', 1)];
    const current = new Map([['b', currentTokens[0]]]);
    const result = diffViewable(previous, current, currentTokens);
    expect(result.hasChanged).toBe(true);
    expect(result.changed).toContainEqual({ ...tokenFor('b', 1) });
    expect(result.changed).toContainEqual({ ...tokenFor('a', 0), isViewable: false });
  });

  it('reports a change when the set sizes differ even with an overlapping key', () => {
    const previous = new Map([['a', tokenFor('a', 0)]]);
    const currentTokens = [tokenFor('a', 0), tokenFor('b', 1)];
    const current = new Map([
      ['a', currentTokens[0]],
      ['b', currentTokens[1]],
    ]);
    expect(diffViewable(previous, current, currentTokens).hasChanged).toBe(true);
  });
});

describe('maxMinimumViewTime', () => {
  it('reports 0 with no pairs', () => {
    expect(maxMinimumViewTime([])).toBe(0);
  });

  // why: multiple viewability configs are folded into ONE unified classification pass, gated on
  // the STRICTEST (largest) minimumViewTime among them — using any smaller value would fire a
  // callback before a config with a longer dwell requirement has actually been satisfied.
  it('picks the largest configured minimumViewTime, ignoring pairs that leave it unset', () => {
    const pairs: IViewabilityConfigCallbackPair<unknown>[] = [
      { viewabilityConfig: { minimumViewTime: 100 }, onViewableItemsChanged: () => {} },
      { viewabilityConfig: {}, onViewableItemsChanged: () => {} },
      { viewabilityConfig: { minimumViewTime: 250 }, onViewableItemsChanged: () => {} },
    ];
    expect(maxMinimumViewTime(pairs)).toBe(250);
  });
});
