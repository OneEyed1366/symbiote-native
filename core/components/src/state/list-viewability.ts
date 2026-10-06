// Which cells count as viewable and what changed between two passes

import {
  DEFAULT_VIEW_AREA_COVERAGE_PERCENT_THRESHOLD,
  EMPTY_OFFSET,
  FULLY_VISIBLE_PERCENT,
} from './list-constants';
import { resolveItemKey } from './list-keys';
import type { ICellLayout } from './list-types';

// Reported to `onViewableItemsChanged`, RN's token minus the section field a section list adds
export type IViewToken<ItemT> = {
  item: ItemT;
  key: string;
  index: number;
  isViewable: boolean;
};

export type IViewabilityConfig = {
  minimumViewTime?: number;
  viewAreaCoveragePercentThreshold?: number;
  itemVisiblePercentThreshold?: number;
  // Nothing reports viewable until the first scroll interaction
  waitForInteraction?: boolean;
};

export type IViewableItemsChangedInfo<ItemT> = {
  viewableItems: IViewToken<ItemT>[];
  changed: IViewToken<ItemT>[];
  // The config of the pair that fired, so one callback shared across pairs can tell them apart
  viewabilityConfig?: IViewabilityConfig;
};

export type IViewabilityConfigCallbackPair<ItemT> = {
  viewabilityConfig: IViewabilityConfig;
  onViewableItemsChanged: (info: IViewableItemsChangedInfo<ItemT>) => void;
};

export type IViewport = { offset: number; length: number };

// The area threshold is a share of the VIEWPORT, the item threshold a share of the CELL
// The two are not interchangeable, the area one wins whenever set
export function isCellViewable(
  cell: ICellLayout,
  viewport: IViewport,
  config: IViewabilityConfig,
): boolean {
  // Floored like RN, so a sub-pixel overhang does not hide a fully visible cell
  const top = Math.floor(cell.offset - viewport.offset);
  const bottom = Math.floor(top + cell.length);
  // RN's caller loop never reaches a cell with no overlap, so this is exclusion, not a 0% pass
  if (bottom <= EMPTY_OFFSET || top >= viewport.length) return false;
  // Fully inside is viewable in either mode, or a viewport-sized area threshold rejects small cells
  if (top >= EMPTY_OFFSET && bottom <= viewport.length && bottom > top) {
    return true;
  }
  const visiblePixels =
    Math.min(bottom, viewport.length) - Math.max(top, EMPTY_OFFSET);
  const areaThreshold = config.viewAreaCoveragePercentThreshold;
  const isAreaMode = areaThreshold !== undefined;
  const threshold = isAreaMode
    ? areaThreshold
    : (config.itemVisiblePercentThreshold ??
      DEFAULT_VIEW_AREA_COVERAGE_PERCENT_THRESHOLD);
  const denominator = isAreaMode ? viewport.length : cell.length;
  if (denominator <= EMPTY_OFFSET) return false;
  return (visiblePixels / denominator) * FULLY_VISIBLE_PERCENT >= threshold;
}

// RN takes the single-config form or the pairs form, not both, so fold them into one list
export function buildViewabilityPairs<ItemT>(
  onViewableItemsChanged:
    ((info: IViewableItemsChangedInfo<ItemT>) => void) | undefined,
  viewabilityConfig: IViewabilityConfig | undefined,
  pairs: IViewabilityConfigCallbackPair<ItemT>[] | undefined,
): IViewabilityConfigCallbackPair<ItemT>[] {
  const result: IViewabilityConfigCallbackPair<ItemT>[] = [];
  if (onViewableItemsChanged !== undefined) {
    result.push({
      viewabilityConfig: viewabilityConfig ?? {},
      onViewableItemsChanged,
    });
  }
  if (pairs !== undefined) result.push(...pairs);
  return result;
}

export type IViewableSetParams<ItemT> = {
  first: number;
  last: number;
  count: number;
  offsets: number[];
  lengths: number[];
  scrollOffset: number;
  viewportLength: number;
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  keyExtractor?: (item: ItemT, index: number) => string;
  pairs: IViewabilityConfigCallbackPair<ItemT>[];
  hasInteracted: boolean;
};

function isViewableByAnyPair<ItemT>(
  params: IViewableSetParams<ItemT>,
  index: number,
): boolean {
  const cell = { offset: params.offsets[index], length: params.lengths[index] };
  const viewport = {
    offset: params.scrollOffset,
    length: params.viewportLength,
  };
  return params.pairs.some(pair => {
    const isWaiting =
      pair.viewabilityConfig.waitForInteraction === true &&
      !params.hasInteracted;
    return !isWaiting && isCellViewable(cell, viewport, pair.viewabilityConfig);
  });
}

// A cell is viewable when ANY config says so, a waiting config says nothing before a scroll
export function computeViewableSet<ItemT>(params: IViewableSetParams<ItemT>): {
  tokens: IViewToken<ItemT>[];
  map: Map<string, IViewToken<ItemT>>;
} {
  const tokens: IViewToken<ItemT>[] = [];
  const map = new Map<string, IViewToken<ItemT>>();
  const end = Math.min(params.last, params.count - 1);
  for (let index = params.first; index <= end; index += 1) {
    if (!isViewableByAnyPair(params, index)) continue;
    const item = params.getItem(params.data, index);
    const key = resolveItemKey(item, index, params.keyExtractor);
    const token: IViewToken<ItemT> = { item, key, index, isViewable: true };
    map.set(key, token);
    tokens.push(token);
  }
  return { tokens, map };
}

function hasSameKeys<ItemT>(
  previous: Map<string, IViewToken<ItemT>>,
  current: Map<string, IViewToken<ItemT>>,
): boolean {
  if (previous.size !== current.size) return false;
  return [...current.keys()].every(key => previous.has(key));
}

// The `changed` delta, newly viewable then newly hidden, empty when the key sets are identical
export function diffViewable<ItemT>(
  previous: Map<string, IViewToken<ItemT>>,
  current: Map<string, IViewToken<ItemT>>,
  currentTokens: IViewToken<ItemT>[],
): { changed: IViewToken<ItemT>[]; hasChanged: boolean } {
  if (hasSameKeys(previous, current)) return { changed: [], hasChanged: false };
  const changed = currentTokens.filter(token => !previous.has(token.key));
  for (const [key, token] of previous) {
    if (!current.has(key)) changed.push({ ...token, isViewable: false });
  }
  return { changed, hasChanged: true };
}

// The unified pass is gated on the largest `minimumViewTime` across pairs
export function maxMinimumViewTime<ItemT>(
  pairs: IViewabilityConfigCallbackPair<ItemT>[],
): number {
  return Math.max(
    EMPTY_OFFSET,
    ...pairs.map(
      pair => pair.viewabilityConfig.minimumViewTime ?? EMPTY_OFFSET,
    ),
  );
}
