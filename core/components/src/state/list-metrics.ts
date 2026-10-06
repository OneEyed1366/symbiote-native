// Cell geometry for the list state: host event readers, the offset table, the resident window

import type { ISymbioteEvent } from '@symbiote-native/engine';
import { EMPTY_OFFSET, FIRST_INDEX } from './list-constants';
import type { ICellLayout } from './list-types';
import type { IRenderRange } from './virtualize-utils';

// The `nativeEvent` payload arrives as `unknown`, so it is narrowed with runtime checks
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? { ...value } : undefined;
}

function readNativeNumber(
  event: ISymbioteEvent,
  group: 'contentOffset' | 'contentSize' | 'layout' | 'layoutMeasurement',
  key: string,
): number | undefined {
  const native = asRecord(event.nativeEvent);
  const fields = asRecord(native?.[group]);
  const value = fields?.[key];
  return typeof value === 'number' ? value : undefined;
}

export function readScrollOffset(
  event: ISymbioteEvent,
  horizontal: boolean,
): number | undefined {
  return readNativeNumber(event, 'contentOffset', horizontal ? 'x' : 'y');
}

// The whole scroll content, as a scroll event reports it
export function readContentLength(
  event: ISymbioteEvent,
  horizontal: boolean,
): number | undefined {
  return readNativeNumber(
    event,
    'contentSize',
    horizontal ? 'width' : 'height',
  );
}

// How much of the scroll content the viewport shows, as a scroll event reports it
export function readViewportLength(
  event: ISymbioteEvent,
  horizontal: boolean,
): number | undefined {
  return readNativeNumber(
    event,
    'layoutMeasurement',
    horizontal ? 'width' : 'height',
  );
}

// The cell's own position in the scroll content as the host reported it
// `buildOffsets` stores it VERBATIM, so the table says where content is, not a sum of heights
export function readLayoutOffset(
  event: ISymbioteEvent,
  horizontal: boolean,
): number | undefined {
  return readNativeNumber(event, 'layout', horizontal ? 'x' : 'y');
}

export function readLayoutLength(
  event: ISymbioteEvent,
  horizontal: boolean,
): number | undefined {
  return readNativeNumber(event, 'layout', horizontal ? 'width' : 'height');
}

export type IOffsetTableParams = {
  count: number;
  measured: Map<number, number>;
  measuredOffsets: Map<number, number>;
  // Indices whose measurement belongs to another key now, treated as unmeasured
  staleIndices?: ReadonlySet<number>;
  // A fixed `getItemLayout` is authoritative by contract and skips every estimate
  fixedLayout: ((index: number) => ICellLayout) | undefined;
  averageLength: number;
  // Unmeasured cells advance by this origin-to-origin stride, not by length alone
  // Separators and gaps live between cells, so heights alone fall short
  averageStride?: number;
};

// Every offset and length from the cache or `getItemLayout`, gaps filled with the averages
// A measured cell sits at its `onLayout` value, never rebased onto a sum, or a Yoga `gap`
// shift would compound once `buildListPlan` feeds a sized spacer back through this table
export function buildOffsets(params: IOffsetTableParams): {
  offsets: number[];
  lengths: number[];
  total: number;
} {
  const { count, measured, measuredOffsets, fixedLayout, averageLength } =
    params;
  const offsets: number[] = new Array<number>(count);
  const lengths: number[] = new Array<number>(count);
  // The chrome drawn between two cells, applied only to the part nobody measured
  const interCellChrome = Math.max(
    EMPTY_OFFSET,
    (params.averageStride ?? averageLength) - averageLength,
  );
  let cursor = EMPTY_OFFSET;
  for (let index = FIRST_INDEX; index < count; index += 1) {
    const layout = fixedLayout?.(index);
    const isStale = params.staleIndices?.has(index) === true;
    const known =
      layout?.offset ?? (isStale ? undefined : measuredOffsets.get(index));
    offsets[index] = known ?? cursor;
    lengths[index] =
      layout?.length ??
      (isStale ? undefined : measured.get(index)) ??
      averageLength;
    cursor = offsets[index] + lengths[index] + interCellChrome;
  }
  const last = count - 1;
  const total =
    count > FIRST_INDEX ? offsets[last] + lengths[last] : EMPTY_OFFSET;
  return { offsets, lengths, total };
}

// RN's `_initialRenderRegion`: `initialNumToRender` cells from `initialScrollIndex`, clamped
export function initialRenderRegion(
  count: number,
  initialScrollIndex: number | undefined,
  initialNumToRender: number,
): IRenderRange {
  const first = Math.max(
    FIRST_INDEX,
    Math.min(count - 1, Math.floor(initialScrollIndex ?? FIRST_INDEX)),
  );
  return { first, last: Math.min(count, first + initialNumToRender) - 1 };
}

export type IIndexOffsetParams = {
  index: number;
  // 0 top, 1 bottom, 0.5 center, as in RN's `scrollToIndex`
  viewPosition: number;
  // Absolute nudge on top of `viewPosition`
  viewOffset: number;
  count: number;
  offsets: number[];
  lengths: number[];
  viewportLength: number;
};

// Pixel offset that lands `index` at the requested viewport position
// A fractional index lands that share of the way through its cell, `viewOffset` is subtracted
// AFTER the clamp so a positive one on the first cell scrolls above the content
export function offsetForIndex(params: IIndexOffsetParams): number {
  const { count, offsets, lengths } = params;
  const clamped = Math.max(FIRST_INDEX, Math.min(params.index, count - 1));
  const cell = Math.floor(clamped);
  const cellLength = lengths[cell] ?? EMPTY_OFFSET;
  const cellOffset =
    (offsets[cell] ?? EMPTY_OFFSET) + (clamped - cell) * cellLength;
  const positioned =
    cellOffset - params.viewPosition * (params.viewportLength - cellLength);
  return Math.max(EMPTY_OFFSET, positioned) - params.viewOffset;
}

// Two readings are the SAME measurement unless they differ by more than this
// A relayout does not reproduce a float bit for bit, `===` would loop at frame rate on noise
// One device pixel (a third of a point at @3x) sits far above that noise
export const LAYOUT_EPSILON = 0.01;

// `known` is optional because a first measurement has nothing to settle against
export function isSettledLayout(
  known: number | undefined,
  reported: number,
): boolean {
  return known !== undefined && Math.abs(known - reported) < LAYOUT_EPSILON;
}

// Average of the known cell lengths, sizes unmeasured cells and the trailing spacer
export function averageMeasuredLength(measured: Map<number, number>): number {
  if (measured.size === EMPTY_OFFSET) return EMPTY_OFFSET;
  let sum = EMPTY_OFFSET;
  for (const length of measured.values()) sum += length;
  return sum / measured.size;
}

// Average origin-to-origin distance between ADJACENT measured cells: length plus the gap chrome
// Not `averageMeasuredLength`: sizing by heights alone under-reserves the spacer and the
// content below slides up, so this falls back to the length average until a pair is measured
export function averageMeasuredStride(
  measuredOffsets: Map<number, number>,
  fallback: number,
): number {
  let sum = EMPTY_OFFSET;
  let pairs = EMPTY_OFFSET;
  for (const [index, offset] of measuredOffsets) {
    const next = measuredOffsets.get(index + 1);
    if (next === undefined) continue;
    sum += next - offset;
    pairs += 1;
  }
  return pairs === EMPTY_OFFSET ? fallback : sum / pairs;
}

// The largest measured index, `ListMetricsAggregator.getHighestMeasuredCellIndex` in RN
// RN answers 0 with nothing measured, so `scrollToIndex(0)` is not a measurement failure
export function highestMeasuredIndex(measured: Map<number, number>): number {
  let highest = FIRST_INDEX;
  for (const index of measured.keys()) {
    if (index > highest) highest = index;
  }
  return highest;
}

// Wraps the user's `getItemLayout` into `(index) => ICellLayout`, dropping RN's `index` field
export function wrapFixedLayout(
  data: unknown,
  getItemLayout:
    | ((
        data: unknown,
        index: number,
      ) => { length: number; offset: number; index: number })
    | undefined,
): ((index: number) => ICellLayout) | undefined {
  if (getItemLayout === undefined) return undefined;
  return (index: number): ICellLayout => {
    const layout = getItemLayout(data, index);
    return { length: layout.length, offset: layout.offset };
  };
}

// Sizes unmeasured cells and the trailing spacer: the fixed layout's first length, else the
// measured average, an empty list never calls the fixed layout
export function resolveAverageLength(
  fixedLayout: ((index: number) => ICellLayout) | undefined,
  count: number,
  measured: Map<number, number>,
): number {
  if (fixedLayout === undefined) return averageMeasuredLength(measured);
  return count > FIRST_INDEX ? fixedLayout(FIRST_INDEX).length : EMPTY_OFFSET;
}
