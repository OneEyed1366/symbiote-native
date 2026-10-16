import { describe, it, expect } from 'vitest';
import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  invertedYStyleFor,
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
  initialRenderRegion,
  LIST_SEGMENT_KIND,
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
  type ICellLayout,
  type IOffsetTableParams,
  type IViewToken,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
} from './virtualized-list';
import type { IRenderRange } from './virtualize-utils';

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

// uniform 100px cells: offsets[i] = i*100.
const uniformOffsets = (n: number): number[] =>
  Array.from({ length: n }, (_value, i) => i * 100);

describe('resolveItemKey', () => {
  it('uses the keyExtractor when provided', () => {
    expect(resolveItemKey({ id: 'a' }, 3, item => item.id)).toBe('a');
  });
  // why: VirtualizeUtils.js:248 — the real RN default is `item.key ?? item.id ?? String(index)`,
  // not a bare index. Most apps never pass `keyExtractor` and rely on this to keep list identity
  // stable across inserts/removes; falling straight to the index silently breaks that for them.
  it('falls back to item.key when no keyExtractor is given', () => {
    expect(resolveItemKey({ key: 'k', id: 'a' }, 3, undefined)).toBe('k');
  });
  it('falls back to item.id when there is no item.key', () => {
    expect(resolveItemKey({ id: 'a' }, 3, undefined)).toBe('a');
  });
  it('falls back to the stringified index when the item has neither', () => {
    expect(resolveItemKey({ label: 'a' }, 3, undefined)).toBe('3');
  });
  it('falls back to the stringified index for a non-object item', () => {
    expect(resolveItemKey('a', 3, undefined)).toBe('3');
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
    expect(offsetForEnd(1_000, 300)).toBe(700);
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
    expect(resolveStickySectionHeaders(undefined, [0, 4], 'ios')).toEqual([
      0, 4,
    ]);
  });
  it('does not stick by default off iOS', () => {
    expect(
      resolveStickySectionHeaders(undefined, [0, 4], 'android'),
    ).toBeUndefined();
  });
  it('honors the explicit prop over the platform default', () => {
    expect(resolveStickySectionHeaders(false, [0, 4], 'ios')).toBeUndefined();
    expect(resolveStickySectionHeaders(true, [0, 4], 'android')).toEqual([
      0, 4,
    ]);
  });
});

type IPlanCase = {
  regions: IRenderRange[];
  stickyIndices?: Set<number>;
};

// The plan as RN's snapshots read: a cell is its key, a spacer is `[extent]`
function planShape(planCase: IPlanCase): string {
  const plan = buildListPlan({
    count: 20,
    regions: planCase.regions,
    offsets: uniformOffsets(20),
    lengths: Array.from({ length: 20 }, () => 100),
    keyFor: String,
    stickyIndices: planCase.stickyIndices,
  });
  return plan.segments
    .map(segment =>
      segment.kind === LIST_SEGMENT_KIND.spacer
        ? `[${segment.extent}]`
        : segment.key,
    )
    .join(' ');
}

// 20 uniform 100px cells, sticky section headers at index 0 and 10, the SectionList repro that
// vanished on device once scrolling carried the window past a section's origin index
describe('buildListPlan', () => {
  const sticky = new Set([0, 10]);

  it('force-mounts the nearest sticky index below the window, RN _ensureClosestStickyHeader-style', () => {
    expect(
      planShape({ regions: [{ first: 6, last: 15 }], stickyIndices: sticky }),
    ).toBe('0 [500] 6 7 8 9 10 11 12 13 14 15 [400]');
  });

  it('adds nothing when no sticky index precedes the window', () => {
    expect(
      planShape({ regions: [{ first: 0, last: 9 }], stickyIndices: sticky }),
    ).toBe('0 1 2 3 4 5 6 7 8 9 [1000]');
  });

  it('does not force-mount a sticky index that is already inside the window', () => {
    expect(
      planShape({
        regions: [{ first: 8, last: 12 }],
        stickyIndices: new Set([10]),
      }),
    ).toBe('[800] 8 9 10 11 12 [700]');
  });

  it('keeps a retained region mounted with a spacer for the gap', () => {
    expect(
      planShape({
        regions: [
          { first: 12, last: 15 },
          { first: 0, last: 2 },
        ],
      }),
    ).toBe('0 1 2 [900] 12 13 14 15 [400]');
  });

  it('measures the sticky header against the window, not the retained region', () => {
    expect(
      planShape({
        regions: [
          { first: 14, last: 15 },
          { first: 0, last: 9 },
        ],
        stickyIndices: new Set([10]),
      }),
    ).toBe('0 1 2 3 4 5 6 7 8 9 10 [300] 14 15 [400]');
  });

  it('merges a region that touches the window into one run of cells', () => {
    expect(
      planShape({
        regions: [
          { first: 5, last: 9 },
          { first: 0, last: 4 },
        ],
      }),
    ).toBe('0 1 2 3 4 5 6 7 8 9 [1000]');
  });

  it('is empty for an empty list', () => {
    const plan = buildListPlan({
      count: 0,
      regions: [{ first: 0, last: -1 }],
      offsets: [],
      lengths: [],
      keyFor: String,
    });
    expect(plan.segments).toEqual([]);
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

function tableOf(overrides: Partial<IOffsetTableParams>) {
  return buildOffsets({
    count: 0,
    measured: new Map(),
    measuredOffsets: new Map(),
    fixedLayout: undefined,
    averageLength: 0,
    ...overrides,
  });
}

describe('buildOffsets', () => {
  // why: with nothing measured by the host, every position is an estimate carried forward from
  // the one before it — a bug here misplaces every cell after the first.
  it('carries unmeasured cells forward from the previous one', () => {
    const measured = new Map([[0, 50]]);
    const result = tableOf({
      count: 3,
      measured,
      averageLength: 20,
      averageStride: 20,
    });
    // cell 0 measured (50), cells 1 and 2 fall back to the 20px average.
    expect(result).toEqual({
      offsets: [0, 50, 70],
      lengths: [50, 20, 20],
      total: 90,
    });
  });

  // why: when the caller supplies getItemLayout, its length is authoritative for every cell —
  // the measured cache and average must never override a fixed layout.
  it('uses the fixed layout length for every cell when getItemLayout is provided', () => {
    // A real getItemLayout reports the cell's own distance from the start of the list, not a
    // height to be summed — RN reads that offset straight off it, and so do we.
    const fixedLayout = (index: number): ICellLayout => ({
      length: 15 + index,
      offset: index === 0 ? 0 : 15 * index + index - 1,
    });
    const result = tableOf({
      count: 3,
      fixedLayout,
      averageLength: 999,
      averageStride: 999,
    });
    expect(result).toEqual({
      offsets: [0, 15, 31],
      lengths: [15, 16, 17],
      total: 48,
    });
  });

  it('returns an empty table with zero total for an empty list', () => {
    expect(tableOf({})).toEqual({
      offsets: [],
      lengths: [],
      total: 0,
    });
  });

  // A separator or section gap sits between cells, so the real distance exceeds the height
  // Summing heights shortens the model and the spacer under-reserves, the rest slides up
  it('uses the real distance between two measured neighbours, not the sum of their heights', () => {
    const measured = new Map([
      [0, 50],
      [1, 50],
    ]);
    // Laid out at y=0 and y=61: 11 points of chrome (a separator) sit between them.
    const offsets = new Map([
      [0, 0],
      [1, 61],
    ]);

    expect(
      tableOf({
        count: 2,
        measured,
        measuredOffsets: offsets,
        averageLength: 50,
      }),
    ).toEqual({
      offsets: [0, 61],
      lengths: [50, 50],
      total: 111,
    });
  });

  // An estimate must not move a cell whose real position is known
  // A fling leaves holes, and a shifting average would slide every later cell back and forth
  it('does not let an unmeasured hole displace a later measured cell', () => {
    const measured = new Map([
      [0, 50],
      [2, 40],
    ]);
    const offsets = new Map([
      [0, 0],
      [2, 200],
    ]);

    const table = tableOf({
      count: 3,
      measured,
      measuredOffsets: offsets,
      averageLength: 999,
    });

    expect(table.offsets[2], 'the measured cell keeps its real position').toBe(
      200,
    );
    expect(table.total).toBe(240);
  });

  // A measured cell sits where the host said, never rebased onto a sum
  // Rebasing made the table a function of its own output, see virtualized-list-feedback.test.ts
  it('places a measured cell at the host offset verbatim, list header included', () => {
    const measured = new Map([
      [0, 50],
      [1, 50],
    ]);
    // A 120pt list header pushed both cells down, and the table KEEPS that: offsets live in the
    // host's content space, the same one contentOffset.y is reported in.
    const hostOffsets = new Map([
      [0, 120],
      [1, 180],
    ]);

    expect(
      tableOf({
        count: 2,
        measured,
        measuredOffsets: hostOffsets,
        averageLength: 50,
        averageStride: 60,
      }).offsets,
    ).toEqual([120, 180]);
  });
});

describe('initialRenderRegion', () => {
  // why: RN's first paint of a list is `initialNumToRender` cells from `initialScrollIndex`
  // (`VirtualizedList._initialRenderRegion`), whatever the viewport would hold.
  it('spans initialNumToRender cells from the start', () => {
    expect(initialRenderRegion(1_000, undefined, 10)).toEqual({
      first: 0,
      last: 9,
    });
  });

  it('starts at initialScrollIndex', () => {
    expect(initialRenderRegion(1_000, 50, 10)).toEqual({ first: 50, last: 59 });
  });

  // why: a list shorter than the region paints what it has, never an index past its end.
  it('stops at the last item', () => {
    expect(initialRenderRegion(5, undefined, 10)).toEqual({
      first: 0,
      last: 4,
    });
    expect(initialRenderRegion(5, 9, 10)).toEqual({ first: 4, last: 4 });
  });
});

type ISpan = [start: number, length: number];

// `cell` is [offset, length] in content space, `viewport` is [scroll offset, viewport length]
function viewable(
  cell: ISpan,
  viewport: ISpan,
  config: IViewabilityConfig,
): boolean {
  return isCellViewable(
    { offset: cell[0], length: cell[1] },
    { offset: viewport[0], length: viewport[1] },
    config,
  );
}

describe('isCellViewable', () => {
  // RN checks `viewAreaCoveragePercentThreshold != null` FIRST to pick the mode
  // Area wins whenever set, the item threshold only when it is not
  it('honors viewAreaCoveragePercentThreshold over an item threshold when both are set', () => {
    // cell [0,100) fully visible in viewport 500: area% = 20, item% = 100
    // The failing item threshold proves area won, since item alone would pass
    expect(
      viewable([0, 100], [0, 500], {
        viewAreaCoveragePercentThreshold: 10,
        itemVisiblePercentThreshold: 99,
      }),
    ).toBe(true);
  });

  it('rejects a cell below itemVisiblePercentThreshold', () => {
    // cell [0,100) at scroll 60 in viewport 500: 40 of 100px visible -> item% = 40
    expect(
      viewable([0, 100], [60, 500], { itemVisiblePercentThreshold: 50 }),
    ).toBe(false);
  });

  // The area threshold is a share of the VIEWPORT, never of the cell's own length
  // The cell stays clear of the entirely-visible shortcut so the percent math runs
  it('measures viewAreaCoveragePercentThreshold against the viewport, not the cell', () => {
    // cell [480,530) clipped by viewport 500 -> 20px visible
    // area% = 20/500*100 = 4, the cell-relative item% would be 40
    expect(
      viewable([480, 50], [0, 500], { viewAreaCoveragePercentThreshold: 10 }),
    ).toBe(false);
    expect(
      viewable([480, 50], [0, 500], { viewAreaCoveragePercentThreshold: 3 }),
    ).toBe(true);
  });

  // RN's `_isEntirelyVisible`: a cell wholly inside the viewport is viewable in either mode
  it('always counts an entirely visible cell as viewable, whatever the area threshold', () => {
    expect(
      viewable([100, 50], [0, 500], { viewAreaCoveragePercentThreshold: 90 }),
    ).toBe(true);
  });

  // RN compares with `>=`, so a cell exactly at the threshold clears it
  it('includes a cell sitting exactly at the threshold (RN uses >=, not >)', () => {
    // cell [400,600), viewport [0,500): 100 of 500 viewport px visible -> area% = 20 exactly
    expect(
      viewable([400, 200], [0, 500], { viewAreaCoveragePercentThreshold: 20 }),
    ).toBe(true);
  });

  it('uses the documented zero default when no threshold is configured at all', () => {
    expect(viewable([0, 100], [1_000, 500], {})).toBe(false);
    expect(viewable([400, 200], [0, 500], {})).toBe(true);
  });

  // RN's caller loop never calls `_isViewable` for a cell with no overlap, whatever the threshold
  it('rejects a cell with no overlap at all, even at threshold 0', () => {
    expect(
      viewable([1_000, 100], [0, 500], { viewAreaCoveragePercentThreshold: 0 }),
    ).toBe(false);
  });

  // `_isEntirelyVisible` is `top >= 0 && bottom <= viewportHeight && bottom > top`
  // A zero-length cell fails the third clause, so it falls through to the percent math
  it('does not treat a zero-length cell as entirely visible', () => {
    expect(
      viewable([100, 0], [0, 500], { viewAreaCoveragePercentThreshold: 1 }),
    ).toBe(false);
    expect(
      viewable([100, 0], [0, 500], { viewAreaCoveragePercentThreshold: 0 }),
    ).toBe(true);
  });
});

describe('offsetForIndex', () => {
  const offsets = uniformOffsets(10);
  const lengths = Array.from({ length: 10 }, () => 100);
  const indexOffset = (
    index: number,
    bias: { viewPosition?: number; viewOffset?: number } = {},
  ): number =>
    offsetForIndex({
      index,
      viewPosition: bias.viewPosition ?? 0,
      viewOffset: bias.viewOffset ?? 0,
      count: 10,
      offsets,
      lengths,
      viewportLength: 500,
    });

  it('clamps an out-of-range index to the last cell', () => {
    expect(indexOffset(999)).toBe(offsets[9]);
  });

  it('aligns the cell to the viewport top with viewPosition 0', () => {
    expect(indexOffset(5)).toBe(500);
  });

  // `viewPosition` biases where the target lands (RN `scrollToIndex`), 1 aligns its bottom edge
  it('aligns the cell to the viewport bottom with viewPosition 1', () => {
    // cellOffset 500, viewport 500, cell 100: positioned = 500 - 1 * (500 - 100) = 100
    expect(indexOffset(5, { viewPosition: 1 })).toBe(100);
  });

  it('nudges the result by viewOffset', () => {
    expect(indexOffset(5, { viewOffset: 30 })).toBe(470);
  });

  it('never returns a negative offset even when the bias would push it below zero', () => {
    expect(indexOffset(0, { viewPosition: 1 })).toBe(0);
  });

  // RN clamps the view-position part and subtracts `viewOffset` after, so a positive offset on the
  // first cell scrolls above the content
  it('lets viewOffset carry the result below zero', () => {
    expect(indexOffset(0, { viewOffset: 30 })).toBe(-30);
  });

  it('interpolates a fractional index inside its cell', () => {
    expect(indexOffset(5.5)).toBe(550);
  });

  // RN allows an index below `count`, so 9.5 lands halfway through the last cell
  it('interpolates a fraction inside the last cell', () => {
    expect(indexOffset(9.5)).toBe(950);
  });
});

describe('averageMeasuredLength', () => {
  it('reports 0 with no measured cells', () => {
    expect(averageMeasuredLength(new Map())).toBe(0);
  });

  it('averages the measured cell lengths', () => {
    expect(
      averageMeasuredLength(
        new Map([
          [0, 20],
          [1, 40],
          [2, 60],
        ]),
      ),
    ).toBe(40);
  });
});

describe('highestMeasuredIndex', () => {
  it('reports 0 with nothing measured, as RN does', () => {
    expect(highestMeasuredIndex(new Map())).toBe(0);
  });

  // why: measurement arrives out of order (cells scroll into view non-sequentially) — the
  // result must be the max KEY, not the last-inserted entry.
  it('reports the highest measured index regardless of insertion order', () => {
    expect(
      highestMeasuredIndex(
        new Map([
          [5, 10],
          [2, 10],
          [8, 10],
          [1, 10],
        ]),
      ),
    ).toBe(8);
  });
});

describe('computeEndReached / computeStartReached', () => {
  it('reports the remaining distance to the end and whether it clears the threshold', () => {
    // total 1000, viewport 500 at offset 400 -> distanceFromEnd = 100; threshold = 1*500 = 500.
    expect(computeEndReached(1_000, 400, 500, 1)).toEqual({
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

  // RN floors a sub-pixel overshoot to 0 so a scroll stopping a hair short still reaches the end
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

  // Without a threshold prop RN fires at a flat 2px (`_maybeCallOnEdgeReached`)
  // The `?? 2` of `onEndReachedThresholdOrDefault` is a windowing multiplier, a different default
  it('defaults an unset end threshold to 2px, not 2 viewport-lengths', () => {
    expect(computeEndReached(1_000, 495, 500, undefined)).toEqual({
      distanceFromEnd: 5,
      withinThreshold: false,
    });
    expect(computeEndReached(1_000, 497, 500, undefined)).toEqual({
      distanceFromEnd: 3,
      withinThreshold: false,
    });
    expect(computeEndReached(1_000, 498, 500, undefined)).toEqual({
      distanceFromEnd: 2,
      withinThreshold: true,
    });
  });

  it('defaults an unset start threshold to 2px, not 2 viewport-lengths', () => {
    expect(computeStartReached(3, 500, undefined)).toEqual({
      distanceFromStart: 3,
      withinThreshold: false,
    });
    expect(computeStartReached(2, 500, undefined)).toEqual({
      distanceFromStart: 2,
      withinThreshold: true,
    });
  });

  it('still treats a given threshold as a viewport-length multiple when unset is not the case', () => {
    // total 1000, viewport 500 at offset 400 -> distanceFromEnd = 100; explicit threshold 1 -> 500.
    expect(computeEndReached(1_000, 400, 500, 1).withinThreshold).toBe(true);
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
    const pairs = [
      {
        viewabilityConfig: { minimumViewTime: 100 },
        onViewableItemsChanged: paired,
      },
    ];
    expect(buildViewabilityPairs(single, undefined, pairs)).toEqual([
      { viewabilityConfig: {}, onViewableItemsChanged: single },
      pairs[0],
    ]);
  });
});

describe('computeViewableSet', () => {
  const data = ['a', 'b', 'c'];
  const getItem = (_source: unknown, index: number): string => data[index];

  function pairsWith(
    config: IViewabilityConfig,
  ): IViewabilityConfigCallbackPair<string>[] {
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
      pairs: pairsWith({
        itemVisiblePercentThreshold: 10,
        waitForInteraction: true,
      }),
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
    expect(result.changed).toContainEqual({
      ...tokenFor('a', 0),
      isViewable: false,
    });
  });

  it('reports a change when the set sizes differ even with an overlapping key', () => {
    const previous = new Map([['a', tokenFor('a', 0)]]);
    const currentTokens = [tokenFor('a', 0), tokenFor('b', 1)];
    const current = new Map([
      ['a', currentTokens[0]],
      ['b', currentTokens[1]],
    ]);
    expect(diffViewable(previous, current, currentTokens).hasChanged).toBe(
      true,
    );
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
      {
        viewabilityConfig: { minimumViewTime: 100 },
        onViewableItemsChanged: () => {},
      },
      { viewabilityConfig: {}, onViewableItemsChanged: () => {} },
      {
        viewabilityConfig: { minimumViewTime: 250 },
        onViewableItemsChanged: () => {},
      },
    ];
    expect(maxMinimumViewTime(pairs)).toBe(250);
  });
});

describe('invertedYStyleFor', () => {
  // why: VirtualizedList.js `styles.verticallyInverted` — Android flips with `scale: -1` because
  // `scaleY: -1` can ANR on API 33+ (react-native#35350); every other platform uses `scaleY`.
  it('flips with scale on Android and scaleY elsewhere', () => {
    expect(invertedYStyleFor('android')).toEqual({
      transform: [{ scale: -1 }],
    });
    expect(invertedYStyleFor('ios')).toEqual({ transform: [{ scaleY: -1 }] });
  });
});
