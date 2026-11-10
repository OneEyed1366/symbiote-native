// The windowed child plan: rendered cells and the spacers that stand in for everything between

import type { IPlatformOSType } from '@symbiote-native/engine';
import { CellRenderMask, type ICellRenderMask } from './cell-render-mask';
import {
  EMPTY_OFFSET,
  FIRST_INDEX,
  STICKY_HEADERS_DEFAULT_OS,
} from './list-constants';
import type { IRenderRange } from './virtualize-utils';

export const LIST_SEGMENT_KIND = {
  spacer: 'spacer',
  cell: 'cell',
} as const;

// Spacers are keyed by their order, so one that slides with the window keeps its element
export type ISpacerSegment = {
  kind: typeof LIST_SEGMENT_KIND.spacer;
  key: string;
  extent: number;
};

export type ICellSegment = {
  kind: typeof LIST_SEGMENT_KIND.cell;
  index: number;
  key: string;
};

export type IListSegment = ISpacerSegment | ICellSegment;

export type IListPlan = {
  segments: IListSegment[];
};

export type IListPlanParams = {
  count: number;
  // The window first, then regions kept mounted outside it (the initial render, a focused cell)
  regions: readonly IRenderRange[];
  offsets: number[];
  lengths: number[];
  keyFor: (index: number) => string;
  stickyIndices?: ReadonlySet<number>;
  // The last spacer stops here when set, so a fling cannot scroll into cells nobody measured
  tailLimit?: number;
  // RN skips every spacer when virtualization is disabled, the head one included
  // False leaves every spacer out, absent keeps them
  hasSpacers?: boolean;
};

// Keeps the nearest sticky header above the window mounted, even when its layout is off-screen
// RN's `_ensureClosestStickyHeader`, the header is a region of its own with a spacer on each side
function addClosestStickyHeader(
  mask: ICellRenderMask,
  stickyIndices: ReadonlySet<number>,
  windowFirst: number,
): void {
  for (let index = windowFirst - 1; index >= FIRST_INDEX; index -= 1) {
    if (stickyIndices.has(index)) {
      mask.addCells({ first: index, last: index });
      return;
    }
  }
}

// A spacer spans two host-reported positions, never a sum of heights
// So the next cell lands exactly where it was
function regionExtent(
  offsets: number[],
  lengths: number[],
  from: number,
  to: number,
): number {
  return to < from ? EMPTY_OFFSET : offsets[to] + lengths[to] - offsets[from];
}

export function buildRenderMask(
  params: Pick<IListPlanParams, 'count' | 'regions' | 'stickyIndices'>,
): ICellRenderMask {
  const mask = new CellRenderMask(params.count);
  if (params.count === EMPTY_OFFSET) return mask;
  for (const region of params.regions) mask.addCells(region);
  const windowFirst = params.regions[0]?.first;
  if (params.stickyIndices !== undefined && windowFirst !== undefined) {
    addClosestStickyHeader(mask, params.stickyIndices, windowFirst);
  }
  return mask;
}

// The adapter walks this plan and creates the host elements
// Only element creation and the user's `renderItem` stay per adapter
export function buildListPlan(params: IListPlanParams): IListPlan {
  const { offsets, lengths, keyFor } = params;
  const segments: IListSegment[] = [];
  let spacerCount = EMPTY_OFFSET;
  const regions = buildRenderMask(params).enumerateRegions();
  for (const [position, region] of regions.entries()) {
    if (region.isSpacer && params.hasSpacers === false) continue;
    if (region.isSpacer) {
      const isTail = position === regions.length - 1;
      const to =
        isTail && params.tailLimit !== undefined
          ? Math.min(region.last, Math.max(region.first - 1, params.tailLimit))
          : region.last;
      const extent = regionExtent(offsets, lengths, region.first, to);
      // A gap nothing has measured yet reserves no room, so it paints no node
      if (extent > EMPTY_OFFSET) {
        segments.push({
          kind: LIST_SEGMENT_KIND.spacer,
          key: `spacer-${spacerCount}`,
          extent,
        });
      }
      spacerCount += 1;
      continue;
    }
    for (let index = region.first; index <= region.last; index += 1) {
      segments.push({
        kind: LIST_SEGMENT_KIND.cell,
        index,
        key: keyFor(index),
      });
    }
  }
  return { segments };
}

// The explicit prop overrides the per-platform default
// Returns the header indices to stick, or undefined when sticking is off
export function resolveStickySectionHeaders(
  enabled: boolean | undefined,
  headerIndices: number[],
  platformOS: IPlatformOSType,
): number[] | undefined {
  const isStickyEnabled = enabled ?? platformOS === STICKY_HEADERS_DEFAULT_OS;
  return isStickyEnabled ? headerIndices : undefined;
}
