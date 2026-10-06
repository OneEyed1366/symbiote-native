// The render-window math of RN's `VirtualizeUtils`, over metrics the caller supplies

export type IRenderRange = { first: number; last: number };

export type IWindowMetrics = {
  itemCount: number;
  getCellMetricsApprox: (index: number) => { offset: number; length: number };
};

export type IScrollMetrics = {
  offset: number;
  velocity: number;
  visibleLength: number;
  zoomScale?: number;
};

export type IWindowParams = {
  metrics: IWindowMetrics;
  maxToRenderPerBatch: number;
  windowSize: number;
  prev: IRenderRange;
  scroll: IScrollMetrics;
  // RN gates this correction behind `fixVirtualizeListCollapseWindowSize`, off in stock 0.86
  fixCollapseWindowSize?: boolean;
};

// First cell containing the offset, the start bound is inclusive only for cell 0
function findOverlappingCell(
  currentOffset: number,
  metrics: IWindowMetrics,
  zoomScale: number,
): number | undefined {
  let left = 0;
  let right = metrics.itemCount - 1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    const frame = metrics.getCellMetricsApprox(mid);
    const start = frame.offset * zoomScale;
    const end = (frame.offset + frame.length) * zoomScale;
    if (
      (mid === 0 && currentOffset < start) ||
      (mid !== 0 && currentOffset <= start)
    ) {
      right = mid - 1;
    } else if (currentOffset > end) {
      left = mid + 1;
    } else {
      return mid;
    }
  }
  return undefined;
}

// Sparse on purpose, an offset no cell covers leaves its slot unset like RN's result does
export function elementsThatOverlapOffsets(
  offsets: readonly number[],
  metrics: IWindowMetrics,
  zoomScale = 1,
): Array<number | undefined> {
  const result: Array<number | undefined> = [];
  offsets.forEach((currentOffset, offsetIndex) => {
    const found = findOverlappingCell(currentOffset, metrics, zoomScale);
    if (found !== undefined) result[offsetIndex] = found;
  });
  return result;
}

// How many cells of `next` are not already in `prev`
export function newRangeCount(prev: IRenderRange, next: IRenderRange): number {
  return (
    next.last -
    next.first +
    1 -
    Math.max(
      0,
      1 + Math.min(next.last, prev.last) - Math.max(next.first, prev.first),
    )
  );
}

type IFillState = { first: number; last: number; newCellCount: number };

type IFillContext = {
  overscan: IRenderRange;
  prev: IRenderRange;
  maxToRenderPerBatch: number;
  fillPreference: 'after' | 'before' | 'none';
  fixCollapseWindowSize: boolean;
};

function addsMore(
  state: IFillState,
  { prev, fixCollapseWindowSize }: IFillContext,
): { first: boolean; last: boolean } {
  if (fixCollapseWindowSize) {
    return { first: state.first <= prev.first, last: state.last >= prev.last };
  }
  return {
    first: state.first <= prev.first || state.first > prev.last,
    last: state.last >= prev.last || state.last < prev.first,
  };
}

type IGrowth = { first: boolean; last: boolean; stalled: boolean };

// Which sides may still grow, `stalled` when the budget is spent and every step adds a new cell
function growthOf(
  state: IFillState,
  context: IFillContext,
  more: { first: boolean; last: boolean },
): IGrowth {
  const { overscan, maxToRenderPerBatch } = context;
  const maxNewCells = state.newCellCount >= maxToRenderPerBatch;
  const first = state.first > overscan.first && (!maxNewCells || !more.first);
  const last = state.last < overscan.last && (!maxNewCells || !more.last);
  return { first, last, stalled: maxNewCells && !first && !last };
}

function applyGrowth(
  state: IFillState,
  fillPreference: IFillContext['fillPreference'],
  more: { first: boolean; last: boolean },
  growth: IGrowth,
): void {
  const firstYields = fillPreference === 'after' && growth.last && more.last;
  if (growth.first && !firstYields) {
    if (more.first) state.newCellCount += 1;
    state.first -= 1;
  }
  const lastYields = fillPreference === 'before' && growth.first && more.first;
  if (growth.last && !lastYields) {
    if (more.last) state.newCellCount += 1;
    state.last += 1;
  }
}

// One growth step toward the overscan, false once it cannot grow without new cells
function growOnce(state: IFillState, context: IFillContext): boolean {
  const { overscan, fillPreference } = context;
  if (state.first <= overscan.first && state.last >= overscan.last) {
    return false;
  }
  const more = addsMore(state, context);
  const growth = growthOf(state, context, more);
  if (growth.stalled) return false;
  applyGrowth(state, fillPreference, more, growth);
  return true;
}

function assertSaneWindow(
  window: IRenderRange,
  visible: IRenderRange,
  overscan: IRenderRange,
  itemCount: number,
): void {
  const isSane =
    window.last >= window.first &&
    window.first >= 0 &&
    window.last < itemCount &&
    window.first >= overscan.first &&
    window.last <= overscan.last &&
    window.first <= visible.first &&
    window.last >= visible.last;
  if (!isSane) {
    throw new Error(
      `Bad window calculation ${JSON.stringify({ window, visible, overscan, itemCount })}`,
    );
  }
}

function fillPreferenceOf(velocity: number): IFillContext['fillPreference'] {
  if (velocity > 1) return 'after';
  return velocity < -1 ? 'before' : 'none';
}

// RN's velocity-driven lead factor is commented out upstream, so the overscan splits evenly
function scrollBounds(
  scroll: IScrollMetrics,
  windowSize: number,
): Record<
  'visibleBegin' | 'visibleEnd' | 'overscanBegin' | 'overscanEnd',
  number
> {
  const visibleBegin = Math.max(0, scroll.offset);
  const visibleEnd = visibleBegin + scroll.visibleLength;
  const halfOverscan = ((windowSize - 1) * scroll.visibleLength) / 2;
  return {
    visibleBegin,
    visibleEnd,
    overscanBegin: Math.max(0, visibleBegin - halfOverscan),
    overscanEnd: Math.max(0, visibleEnd + halfOverscan),
  };
}

// The visible cells grown toward the overscan region, at most `maxToRenderPerBatch` new ones
export function computeWindowedRenderLimits(
  params: IWindowParams,
): IRenderRange {
  const { metrics, maxToRenderPerBatch, windowSize, prev, scroll } = params;
  const { itemCount } = metrics;
  if (itemCount === 0) return { first: 0, last: -1 };

  const zoomScale = scroll.zoomScale ?? 1;
  const { visibleBegin, visibleEnd, overscanBegin, overscanEnd } = scrollBounds(
    scroll,
    windowSize,
  );

  const lastItemOffset =
    metrics.getCellMetricsApprox(itemCount - 1).offset * zoomScale;
  if (lastItemOffset < overscanBegin) {
    // The whole list sits above the overscan window
    return {
      first: Math.max(0, itemCount - 1 - maxToRenderPerBatch),
      last: itemCount - 1,
    };
  }

  const [
    overscanFirst = 0,
    firstFound,
    lastFound,
    overscanLast = itemCount - 1,
  ] = elementsThatOverlapOffsets(
    [overscanBegin, visibleBegin, visibleEnd, overscanEnd],
    metrics,
    zoomScale,
  );
  const first = firstFound ?? Math.max(0, overscanFirst);
  const last =
    lastFound ?? Math.min(overscanLast, first + maxToRenderPerBatch - 1);
  const visible = { first, last };
  const overscan = { first: overscanFirst, last: overscanLast };

  const state: IFillState = {
    first,
    last,
    newCellCount: newRangeCount(prev, visible),
  };
  const context: IFillContext = {
    overscan,
    prev,
    maxToRenderPerBatch,
    fillPreference: fillPreferenceOf(scroll.velocity),
    fixCollapseWindowSize: params.fixCollapseWindowSize ?? false,
  };
  while (growOnce(state, context)) {
    // all growth happens in `growOnce`
  }
  const window = { first: state.first, last: state.last };
  assertSaneWindow(window, visible, overscan, itemCount);
  return window;
}
