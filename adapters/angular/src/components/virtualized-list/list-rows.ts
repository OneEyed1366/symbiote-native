// The rows the template stamps: the plan's spacers and cells, keyed so a window slide moves them

import {
  LIST_SEGMENT_KIND,
  spacerStyleOf,
  type IWindowPlan,
} from '@symbiote-native/components';
import type { IViewStyle } from '@symbiote-native/engine';
import type { CellRegistry, IWindowCell } from './cell-registry';
import type { IVListCellContext } from './directives';

export type ISpacerRow = {
  kind: typeof LIST_SEGMENT_KIND.spacer;
  key: string;
  style: IViewStyle;
};

export type ICellRow<ItemT> = {
  kind: typeof LIST_SEGMENT_KIND.cell;
  key: string;
  cell: IWindowCell<ItemT>;
  // Only when the app drew its own cell wrapper with `vListCell`
  renderer: IVListCellContext | undefined;
};

export type IListRow<ItemT> = ISpacerRow | ICellRow<ItemT>;

export type IRowsParams<ItemT> = {
  windowPlan: IWindowPlan;
  cells: CellRegistry<ItemT>;
  count: number;
  isHorizontal: boolean;
  hasSeparators: boolean;
  rendererFor: ((cell: IWindowCell<ItemT>) => IVListCellContext) | undefined;
};

// A cell and a spacer never share a row key, an item key cannot start with `spacer-`
export function stampPlanRows<ItemT>(
  params: IRowsParams<ItemT>,
): IListRow<ItemT>[] {
  const { windowPlan, cells, count, isHorizontal, hasSeparators, rendererFor } =
    params;
  return windowPlan.plan.segments.map((segment): IListRow<ItemT> => {
    if (segment.kind === LIST_SEGMENT_KIND.spacer) {
      return {
        kind: segment.kind,
        key: segment.key,
        style: spacerStyleOf(segment.extent, isHorizontal),
      };
    }
    // The separator gates on the last index of the data, not of the window, or a cell's height
    // would shift as it slides past
    const cell = cells.windowCell(
      segment.index,
      segment.key,
      hasSeparators && segment.index < count - 1,
      windowPlan.stickySet?.has(segment.index) === true,
    );
    return {
      kind: segment.kind,
      key: `cell-${segment.key}`,
      cell,
      renderer: rendererFor?.(cell),
    };
  });
}
