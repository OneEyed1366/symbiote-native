// Edge-reached decisions: distance to each end, the threshold test and the content-length dedup

import {
  DEFAULT_EDGE_REACHED_THRESHOLD_PX,
  EMPTY_OFFSET,
  FIRST_INDEX,
  NO_CONTENT_LENGTH_SENT,
  ON_EDGE_REACHED_EPSILON,
} from './list-constants';

// `thresholdMultiplier` undefined means the app gave no `onEndReachedThreshold`
// RN's answer is then a flat pixel count, never a viewport-length multiple
function thresholdFor(
  thresholdMultiplier: number | undefined,
  viewportLength: number,
): number {
  return thresholdMultiplier != null
    ? thresholdMultiplier * viewportLength
    : DEFAULT_EDGE_REACHED_THRESHOLD_PX;
}

// Sub-pixel distances floor to 0 so a debounced scroll stopping short still reaches the edge
function settleDistance(distance: number): number {
  return distance < ON_EDGE_REACHED_EPSILON ? EMPTY_OFFSET : distance;
}

// Pure geometry, the adapter still gates on the last cell being rendered and dedups by length
export function computeEndReached(
  total: number,
  scrollOffset: number,
  viewportLength: number,
  thresholdMultiplier: number | undefined,
): { distanceFromEnd: number; withinThreshold: boolean } {
  const distanceFromEnd = settleDistance(
    total - (scrollOffset + viewportLength),
  );
  return {
    distanceFromEnd,
    withinThreshold:
      distanceFromEnd <= thresholdFor(thresholdMultiplier, viewportLength),
  };
}

// `onStartReached` twin of `computeEndReached`, the distance from the start is the scroll offset
export function computeStartReached(
  scrollOffset: number,
  viewportLength: number,
  thresholdMultiplier: number | undefined,
): { distanceFromStart: number; withinThreshold: boolean } {
  const distanceFromStart = settleDistance(scrollOffset);
  return {
    distanceFromStart,
    withinThreshold:
      distanceFromStart <= thresholdFor(thresholdMultiplier, viewportLength),
  };
}

// Pixel offset that scrolls the last content to the bottom edge, never negative for short content
export function offsetForEnd(total: number, viewportLength: number): number {
  return Math.max(EMPTY_OFFSET, total - viewportLength);
}

// A gap index addresses a real separator only inside [0, count - 2], RN bails on the same bounds
export function isSeparatorGapInRange(
  gapIndex: number,
  count: number,
): boolean {
  return gapIndex >= FIRST_INDEX && gapIndex <= count - 2;
}

export type IEdgeReachedParams = {
  withinThreshold: boolean;
  edgeCellRendered: boolean;
  total: number;
  sentForContentLength: number;
};

// Fire decision folded with the "edge cell rendered" gate and the dedup on the last-fired length
export function decideEdgeReached(params: IEdgeReachedParams): {
  shouldFire: boolean;
  nextSentForContentLength: number;
} {
  const { withinThreshold, edgeCellRendered, total, sentForContentLength } =
    params;
  if (withinThreshold && edgeCellRendered && sentForContentLength !== total) {
    return { shouldFire: true, nextSentForContentLength: total };
  }
  // Re-arm once out of threshold so the next approach can fire again
  if (!withinThreshold) {
    return {
      shouldFire: false,
      nextSentForContentLength: NO_CONTENT_LENGTH_SENT,
    };
  }
  return { shouldFire: false, nextSentForContentLength: sentForContentLength };
}
