// One cell's content: `ListItemComponent` or `renderItem`, RN's `_renderElement`

import type { Accessor } from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import { drawItem } from '@symbiote-native/components';
import type {
  IVirtualizedListCellInfo,
  IVirtualizedListProps,
} from './virtualized-list-props';

type IItemRenderers<ItemT> = Pick<
  IVirtualizedListProps<ItemT>,
  'renderItem' | 'ListItemComponent'
>;

// The component takes the info as plain props, reactive getters over the accessor
export function renderItemContent<ItemT>(
  renderers: IItemRenderers<ItemT>,
  info: Accessor<IVirtualizedListCellInfo<ItemT>>,
): JSX.Element {
  return drawItem(
    {
      renderItem: renderers.renderItem,
      component: renderers.ListItemComponent,
    },
    info,
    (Component, given) => (
      <Component
        item={given().item}
        index={given().index}
        separators={given().separators}
      />
    ),
  );
}
