// The plan for the window a list just derived, and the sticky set its cells are tested against

import { buildListPlan, type IListPlan } from './list-plan';
import type { IListMetrics } from './list-reducer-types';

export type IWindowPlan = {
  plan: IListPlan;
  // Undefined when the app flagged no sticky cells
  stickySet: ReadonlySet<number> | undefined;
};

export function planFromMetrics(
  metrics: Pick<
    IListMetrics,
    'count' | 'regions' | 'offsets' | 'lengths' | 'tailLimit' | 'hasSpacers'
  >,
  keyFor: (index: number) => string,
  stickyHeaderIndices: number[] | undefined,
): IWindowPlan {
  const stickySet =
    stickyHeaderIndices === undefined
      ? undefined
      : new Set(stickyHeaderIndices);
  const plan = buildListPlan({
    count: metrics.count,
    regions: metrics.regions,
    offsets: metrics.offsets,
    lengths: metrics.lengths,
    keyFor,
    stickyIndices: stickySet,
    tailLimit: metrics.tailLimit,
    hasSpacers: metrics.hasSpacers,
  });
  return { plan, stickySet };
}
