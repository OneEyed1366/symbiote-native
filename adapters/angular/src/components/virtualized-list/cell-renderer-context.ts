// The context a `vListCell` template reads for one cell: RN's `CellRendererComponent` props plus
// the template that stamps the item and its separator inside the wrapper the app draws

import type { TemplateRef } from '@angular/core';
import type { IViewStyle } from '@symbiote-native/engine';
import type { IWindowCell } from './cell-registry';
import type { IVListCellContext } from './directives';

export type ICellRendererArgs<ItemT> = {
  cell: IWindowCell<ItemT>;
  style: IViewStyle | undefined;
  // The list's own template holding the cell's item and separator outlets
  body: TemplateRef<unknown> | undefined;
  layout: (
    measure: IWindowCell<ItemT>['measure'],
    event: unknown,
    index: number,
  ) => void;
  focus: (index: number) => void;
};

export function buildCellRendererContext<ItemT>(
  args: ICellRendererArgs<ItemT>,
): IVListCellContext {
  const { cell, style, body, layout, focus } = args;
  return {
    $implicit: cell.context.$implicit,
    cellKey: cell.key,
    index: cell.index,
    style,
    layout: event => layout(cell.measure, event, cell.index),
    focus: () => focus(cell.index),
    content: body,
    contentContext: { $implicit: cell },
  };
}
