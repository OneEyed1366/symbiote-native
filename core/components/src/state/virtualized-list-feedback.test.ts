// Closed-loop simulation of the one thing a unit test of buildOffsets in isolation cannot see: the
// offset table is not only an output, it is also an INPUT to itself. The leading spacer is sized
// from offsets[first], the host lays the window's cells out below that spacer, and their measured
// layout.y — spacer height included — is what feeds the next recompute. Feed a model its own output
// long enough and it either converges on the truth or it runs away.
//
// The content container carries a Yoga `gap`, which is what makes this more than a formality (the
// canary's own .grid does: gap: 12px). A gap sits between EVERY pair of children, so it lands both
// between two cells AND on each side of a spacer — meaning the geometry changes shape depending on
// whether a spacer is currently rendered at all. Differencing two cell offsets measured across that
// change absorbs the difference.
//
// Ground truth is deliberately trivial: every cell is exactly CELL, so the true distance from one
// cell to the next is always CELL + GAP. Nothing here is an approximation to argue about.

import { describe, expect, it } from 'vitest';
import { buildOffsets, computeWindow } from './virtualized-list';

const COUNT = 200;
const CELL = 100;
const GAP = 12;
const PADDING = 12;
const HEADER = 200;
const VIEWPORT = 800;
const WINDOW_SIZE = 3;
const INITIAL = 8;
// A drag emits an onScroll per frame, so the model is re-derived against a freshly-measured window
// many times per second. The step is small on purpose: the failure is per-RECOMPUTE, not per-pixel.
const SCROLL_STEP = 200;
const PASSES = 40;

// One full device round-trip. Derive the table from what has been measured so far, pick the window,
// size the leading spacer from it, then lay the window's cells out the way Yoga would: header, then
// the spacer when it is non-empty, then the cells, with a GAP between each pair. What comes back is
// a RAW y in content coordinates — exactly what readLayoutOffset() forwards into `measure`.
function step(
  measured: Map<number, number>,
  measuredOffsets: Map<number, number>,
  scrollOffset: number,
): { first: number; leadingExtent: number } {
  const { offsets, lengths } = buildOffsets(
    COUNT,
    measured,
    measuredOffsets,
    undefined,
    CELL,
    CELL + GAP,
  );
  const { first, last } = computeWindow(
    COUNT,
    offsets,
    lengths,
    scrollOffset,
    VIEWPORT,
    WINDOW_SIZE,
    INITIAL,
  );

  const leadingExtent =
    first > 0 ? offsets[first - 1] + lengths[first - 1] - offsets[0] : 0;
  let cursor = PADDING + HEADER + GAP;
  if (leadingExtent > 0) cursor += leadingExtent + GAP;
  for (let index = first; index <= last; index += 1) {
    measured.set(index, CELL);
    measuredOffsets.set(index, cursor);
    cursor += CELL + GAP;
  }
  return { first, leadingExtent };
}

describe('buildOffsets under its own feedback', () => {
  it('keeps the leading spacer at the true offset while the window walks down', () => {
    const measured = new Map<number, number>();
    const measuredOffsets = new Map<number, number>();
    const errors: number[] = [];

    let scrollOffset = 0;
    for (let pass = 0; pass < PASSES; pass += 1) {
      const { first, leadingExtent } = step(
        measured,
        measuredOffsets,
        scrollOffset,
      );
      errors.push(
        PADDING +
          HEADER +
          GAP +
          (leadingExtent > 0 ? leadingExtent + GAP : 0) -
          (PADDING + HEADER + GAP + first * (CELL + GAP)),
      );
      scrollOffset += SCROLL_STEP;
    }

    // The whole point: the error must not grow with the number of recomputes. A model that gains a
    // GAP every pass reaches thousands of pixels within a second of dragging, at which point the
    // spacer no longer describes where native actually put the content and the window lands on
    // cells that are nowhere near the viewport — the canary's blank screen.
    expect(Math.max(...errors)).toBe(0);
  });
});
