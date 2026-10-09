// Port of RN's `ViewabilityHelper-test.js`, the expectations are RN's own
// The helper's `onUpdate` timers live in the adapters, here the pure half: which cells are viewable
// and what changed between two passes
import { describe, expect, it } from 'vitest';
import {
  computeViewableSet,
  diffViewable,
  maxMinimumViewTime,
  type IViewToken,
  type IViewabilityConfig,
} from './virtualized-list';

type IFrame = { key: string; y: number; height: number };

const DEFAULT_CONFIG: IViewabilityConfig = {
  viewAreaCoveragePercentThreshold: 0,
};

type IViewOptions = { config?: IViewabilityConfig; hasInteracted?: boolean };

function viewableSet(
  frames: IFrame[],
  scrollOffset: number,
  viewportLength: number,
  options: IViewOptions = {},
): { tokens: IViewToken<IFrame>[]; map: Map<string, IViewToken<IFrame>> } {
  const { config = DEFAULT_CONFIG, hasInteracted = true } = options;
  return computeViewableSet<IFrame>({
    first: 0,
    last: frames.length - 1,
    count: frames.length,
    offsets: frames.map(frame => frame.y),
    lengths: frames.map(frame => frame.height),
    scrollOffset,
    viewportLength,
    data: frames,
    getItem: (_data, index) => frames[index],
    keyExtractor: item => item.key,
    pairs: [{ viewabilityConfig: config, onViewableItemsChanged: () => {} }],
    hasInteracted,
  });
}

function indices(
  frames: IFrame[],
  scrollOffset: number,
  viewportLength: number,
  config?: IViewabilityConfig,
): number[] {
  return viewableSet(frames, scrollOffset, viewportLength, {
    config,
  }).tokens.map(token => token.index);
}

const frame = (key: string, y: number, height: number): IFrame => ({
  key,
  y,
  height,
});

describe('computeViewableItems', () => {
  it('returns all 4 entirely visible rows as viewable', () => {
    const rows = [
      frame('a', 0, 50),
      frame('b', 50, 50),
      frame('c', 100, 50),
      frame('d', 150, 50),
    ];
    expect(
      indices(rows, 0, 200, { viewAreaCoveragePercentThreshold: 50 }),
    ).toEqual([0, 1, 2, 3]);
  });

  it('returns top 2 rows as viewable (entirely visible and majority)', () => {
    const rows = [
      frame('a', 0, 50),
      frame('b', 50, 150),
      frame('c', 200, 50),
      frame('d', 250, 50),
    ];
    expect(
      indices(rows, 0, 200, { viewAreaCoveragePercentThreshold: 50 }),
    ).toEqual([0, 1]);
  });

  it('returns only the 2nd row as viewable (majority)', () => {
    const rows = [
      frame('a', 0, 50),
      frame('b', 50, 150),
      frame('c', 200, 50),
      frame('d', 250, 50),
    ];
    expect(
      indices(rows, 25, 200, { viewAreaCoveragePercentThreshold: 50 }),
    ).toEqual([1]);
  });

  it('handles empty input', () => {
    expect(
      indices([], 0, 200, { viewAreaCoveragePercentThreshold: 50 }),
    ).toEqual([]);
  });

  it('handles different view area coverage percent thresholds', () => {
    const rows = [
      frame('a', 0, 50),
      frame('b', 50, 150),
      frame('c', 200, 500),
      frame('d', 700, 50),
    ];
    const at = (percent: number, offset: number, length: number): number[] =>
      indices(rows, offset, length, {
        viewAreaCoveragePercentThreshold: percent,
      });

    expect(at(0, 0, 50)).toEqual([0]);
    expect(at(0, 1, 50)).toEqual([0, 1]);
    expect(at(0, 199, 50)).toEqual([1, 2]);
    expect(at(0, 250, 50)).toEqual([2]);

    expect(at(100, 0, 200)).toEqual([0, 1]);
    expect(at(100, 1, 200)).toEqual([1]);
    expect(at(100, 400, 200)).toEqual([2]);
    expect(at(100, 600, 200)).toEqual([3]);

    expect(at(10, 30, 200)).toEqual([0, 1, 2]);
    expect(at(10, 31, 200)).toEqual([1, 2]);
  });

  it('handles different item visible percent thresholds', () => {
    const rows = [
      frame('a', 0, 50),
      frame('b', 50, 150),
      frame('c', 200, 50),
      frame('d', 250, 50),
    ];
    const at = (percent: number, offset: number, length: number): number[] =>
      indices(rows, offset, length, { itemVisiblePercentThreshold: percent });

    expect(at(0, 0, 50)).toEqual([0]);
    expect(at(0, 1, 50)).toEqual([0, 1]);

    expect(at(100, 0, 250)).toEqual([0, 1, 2]);
    expect(at(100, 1, 250)).toEqual([1, 2]);

    expect(at(10, 184, 20)).toEqual([1]);
    expect(at(10, 185, 20)).toEqual([1, 2]);
    expect(at(10, 186, 20)).toEqual([2]);
  });

  it('accounts for imprecision on measurements of the viewport and an item', () => {
    // RN floors the cell layout so a sub-pixel overhang does not hide a fully visible item
    const rows = [frame('Item', 1767.6190185546875, 147.4285888671875)];
    expect(
      indices(rows, 1503.61901855, 411.4285583496094, {
        itemVisiblePercentThreshold: 100,
      }),
    ).toEqual([0]);
  });
});

describe('onUpdate', () => {
  function changeBetween(
    before: Map<string, IViewToken<IFrame>>,
    after: ReturnType<typeof viewableSet>,
  ): string[] {
    return diffViewable(before, after.map, after.tokens).changed.map(
      token => `${token.key}:${token.isViewable}`,
    );
  }

  it('returns 1 visible row as viewable then scrolls away', () => {
    const rows = [frame('a', 0, 50)];
    const first = viewableSet(rows, 0, 200);
    expect(changeBetween(new Map(), first)).toEqual(['a:true']);

    const repeat = viewableSet(rows, 0, 200);
    expect(diffViewable(first.map, repeat.map, repeat.tokens).hasChanged).toBe(
      false,
    );

    const away = viewableSet(rows, 100, 200);
    expect(changeBetween(first.map, away)).toEqual(['a:false']);
    expect(away.tokens).toEqual([]);
  });

  it('returns 1st visible row then 1st and 2nd then just 2nd', () => {
    const rows = [frame('a', 0, 200), frame('b', 200, 200)];
    const one = viewableSet(rows, 0, 200);
    expect(changeBetween(new Map(), one)).toEqual(['a:true']);

    const both = viewableSet(rows, 100, 200);
    expect(changeBetween(one.map, both)).toEqual(['b:true']);
    expect(both.tokens.map(token => token.key)).toEqual(['a', 'b']);

    const second = viewableSet(rows, 200, 200);
    expect(changeBetween(both.map, second)).toEqual(['a:false']);
    expect(second.tokens.map(token => token.key)).toEqual(['b']);
  });

  it('reports the largest minimumViewTime across pairs for the delayed pass', () => {
    expect(maxMinimumViewTime([]), 'no pair means no delay').toBe(0);
    expect(
      maxMinimumViewTime([
        {
          viewabilityConfig: { minimumViewTime: 350 },
          onViewableItemsChanged: () => {},
        },
        {
          viewabilityConfig: { minimumViewTime: 100 },
          onViewableItemsChanged: () => {},
        },
      ]),
    ).toBe(350);
  });

  it('waitForInteraction blocks viewability until an interaction', () => {
    const rows = [frame('a', 0, 200), frame('b', 200, 200)];
    const config: IViewabilityConfig = {
      waitForInteraction: true,
      viewAreaCoveragePercentThreshold: 0,
    };
    expect(
      viewableSet(rows, 0, 100, { config, hasInteracted: false }).tokens,
    ).toEqual([]);

    const afterInteraction = viewableSet(rows, 20, 100, {
      config,
      hasInteracted: true,
    });
    expect(changeBetween(new Map(), afterInteraction)).toEqual(['a:true']);
  });

  it('returns the right visible row after the underlying data changed', () => {
    const before = viewableSet(
      [frame('a', 0, 200), frame('b', 200, 200)],
      0,
      200,
    );
    expect(changeBetween(new Map(), before)).toEqual(['a:true']);

    const reordered = viewableSet(
      [frame('c', 0, 200), frame('a', 200, 200), frame('b', 400, 200)],
      0,
      200,
    );
    expect(changeBetween(before.map, reordered)).toEqual(['c:true', 'a:false']);
    expect(reordered.tokens.map(token => token.key)).toEqual(['c']);
  });
});
