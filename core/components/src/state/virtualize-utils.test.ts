// Port of RN's VirtualizeUtils-test.js, metrics given directly instead of through a
// `ListMetricsAggregator`
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error - untyped Flow source
import * as ReactNativeFeatureFlags from 'react-native/src/private/featureflags/ReactNativeFeatureFlags';
// @ts-expect-error - untyped Flow source
import { dangerouslyResetForTesting } from 'react-native/src/private/featureflags/ReactNativeFeatureFlagsBase';
import {
  computeWindowedRenderLimits,
  elementsThatOverlapOffsets,
  newRangeCount,
  type IWindowMetrics,
} from './virtualize-utils';

type IFrame = { offset: number; length: number };

function metricsOf(frames: readonly IFrame[]): IWindowMetrics {
  return {
    itemCount: frames.length,
    getCellMetricsApprox: index => {
      const frame = frames[index];
      if (frame === undefined) throw new Error(`no frame at ${index}`);
      return frame;
    },
  };
}

function evenFrames(count: number, length: number): IFrame[] {
  return Array.from({ length: count }, (_unused, index) => ({
    length,
    offset: length * index,
  }));
}

describe('newRangeCount', () => {
  it('handles subset', () => {
    expect(newRangeCount({ first: 1, last: 4 }, { first: 2, last: 3 })).toBe(0);
  });
  it('handles forward disjoint set', () => {
    expect(newRangeCount({ first: 1, last: 4 }, { first: 6, last: 9 })).toBe(4);
  });
  it('handles reverse disjoint set', () => {
    expect(newRangeCount({ first: 6, last: 8 }, { first: 1, last: 4 })).toBe(4);
  });
  it('handles superset', () => {
    expect(newRangeCount({ first: 1, last: 4 }, { first: 0, last: 5 })).toBe(2);
  });
  it('handles end extension', () => {
    expect(newRangeCount({ first: 1, last: 4 }, { first: 1, last: 8 })).toBe(4);
  });
  it('handles front extension', () => {
    expect(newRangeCount({ first: 1, last: 4 }, { first: 0, last: 4 })).toBe(1);
  });
  it('handles forward intersect', () => {
    expect(newRangeCount({ first: 1, last: 4 }, { first: 3, last: 6 })).toBe(2);
  });
  it('handles reverse intersect', () => {
    expect(newRangeCount({ first: 3, last: 6 }, { first: 1, last: 4 })).toBe(2);
  });
});

describe('elementsThatOverlapOffsets', () => {
  it('handles fixed length', () => {
    expect(
      elementsThatOverlapOffsets(
        [0, 250, 350, 450],
        metricsOf(evenFrames(100, 100)),
      ),
    ).toEqual([0, 2, 3, 4]);
  });

  it('handles variable length', () => {
    const frames = [
      { offset: 0, length: 50 },
      { offset: 50, length: 200 },
      { offset: 250, length: 600 },
      { offset: 850, length: 100 },
      { offset: 950, length: 150 },
    ];
    expect(
      elementsThatOverlapOffsets([150, 250, 900], metricsOf(frames)),
    ).toEqual([1, 1, 3]);
  });

  it('handles frame boundaries', () => {
    expect(
      elementsThatOverlapOffsets(
        [0, 100, 200, 300],
        metricsOf(evenFrames(100, 100)),
      ),
    ).toEqual([0, 0, 1, 2]);
  });

  it('handles out of bounds', () => {
    const frames = [
      { offset: 0, length: 50 },
      { offset: 50, length: 150 },
      { offset: 250, length: 100 },
    ];
    expect(
      elementsThatOverlapOffsets([-100, 150, 900], metricsOf(frames)),
    ).toEqual([undefined, 1]);
  });
});

describe('computeWindowedRenderLimits', () => {
  const scroll = { offset: 0, velocity: 0, visibleLength: 500 };

  it('renders all items when list is small', () => {
    expect(
      computeWindowedRenderLimits({
        metrics: metricsOf(evenFrames(3, 100)),
        maxToRenderPerBatch: 5,
        windowSize: 10,
        prev: { first: 0, last: 2 },
        scroll,
      }),
    ).toEqual({ first: 0, last: 2 });
  });

  afterEach(() => dangerouslyResetForTesting());

  it('handles overflow cases when window size suddenly collapses', () => {
    dangerouslyResetForTesting();
    ReactNativeFeatureFlags.override({
      fixVirtualizeListCollapseWindowSize: () => true,
    });
    const frames = [
      { offset: 0, length: 275 },
      { offset: 275, length: 352 },
      { offset: 627, length: 326 },
      { offset: 953, length: 352 },
      { offset: 1_305, length: 293 },
      { offset: 1_598, length: 293 },
      { offset: 1_891, length: 293 },
      { offset: 2_184, length: 293 },
    ];
    expect(
      computeWindowedRenderLimits({
        metrics: metricsOf(frames),
        maxToRenderPerBatch: 1,
        windowSize: 31,
        prev: { first: 0, last: 5 },
        scroll: {
          offset: 2073.60009765625,
          velocity: 0.9264489707504611,
          visibleLength: 640,
        },
      }),
    ).toEqual({ first: 0, last: 6 });
  });

  it('handles reaching the end of the list', () => {
    expect(
      computeWindowedRenderLimits({
        metrics: metricsOf(evenFrames(10, 100)),
        maxToRenderPerBatch: 2,
        windowSize: 5,
        prev: { first: 5, last: 9 },
        scroll: { offset: 900, velocity: 1, visibleLength: 300 },
      }),
    ).toEqual({ first: 3, last: 9 });
  });

  it('respects maxToRenderPerBatch when adding new cells', () => {
    expect(
      computeWindowedRenderLimits({
        metrics: metricsOf(evenFrames(10, 100)),
        maxToRenderPerBatch: 2,
        windowSize: 5,
        prev: { first: 0, last: 2 },
        scroll,
      }),
    ).toEqual({ first: 0, last: 4 });
  });

  it('handles case where overscanFirst and overscanLast encompass entire list', () => {
    expect(
      computeWindowedRenderLimits({
        metrics: metricsOf(evenFrames(5, 100)),
        maxToRenderPerBatch: 5,
        windowSize: 10,
        prev: { first: 0, last: 4 },
        scroll: { offset: 0, velocity: 0, visibleLength: 1_000 },
      }),
    ).toEqual({ first: 0, last: 4 });
  });

  it('returns an empty window for an empty list', () => {
    expect(
      computeWindowedRenderLimits({
        metrics: metricsOf([]),
        maxToRenderPerBatch: 5,
        windowSize: 10,
        prev: { first: 0, last: -1 },
        scroll,
      }),
    ).toEqual({ first: 0, last: -1 });
  });

  it('jumps to the tail when the whole list sits before the overscan window', () => {
    expect(
      computeWindowedRenderLimits({
        metrics: metricsOf(evenFrames(4, 100)),
        maxToRenderPerBatch: 2,
        windowSize: 3,
        prev: { first: 0, last: 3 },
        scroll: { offset: 5_000, velocity: 0, visibleLength: 500 },
      }),
    ).toEqual({ first: 1, last: 3 });
  });
});
