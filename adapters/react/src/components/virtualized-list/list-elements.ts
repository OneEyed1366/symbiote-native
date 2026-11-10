// Small element builders shared by the list's child walk

import {
  createElement,
  isValidElement,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  buildSeparatorProps,
  drawItem,
  type ISeparatorProps,
} from '@symbiote-native/components';
import type {
  IListItemInfo,
  IListSlot,
  IRenderItem,
  ISeparatorComponent,
} from './virtualized-list-props';

type IItemRenderers<ItemT> = {
  renderItem?: IRenderItem<ItemT>;
  ListItemComponent?: ComponentType<IListItemInfo<ItemT>>;
};

// RN's `_renderElement`: the component wins over `renderItem`, one of the two has to be there
export function renderItemElement<ItemT>(
  renderers: IItemRenderers<ItemT>,
  info: IListItemInfo<ItemT>,
): ReactNode {
  return drawItem(
    {
      renderItem: renderers.renderItem,
      component: renderers.ListItemComponent,
    },
    info,
    (Component, given) => createElement(Component, given),
  );
}

export function resolveElement(component: IListSlot): ReactNode {
  if (component === undefined) return undefined;
  if (typeof component === 'function') return createElement(component, {});
  return component;
}

// The `ItemSeparatorComponent` element for the gap between two items, with the highlight flag and
// any handle-pushed overrides merged on top, RN renders `<ItemSeparatorComponent {...props} />`
export function renderSeparatorElement<ItemT>(
  component: ISeparatorComponent<ItemT> | undefined,
  leadingItem: ItemT,
  trailingItem: ItemT,
  overrides: Partial<ISeparatorProps<ItemT>> | undefined,
): ReactNode {
  if (component === undefined) return undefined;
  if (isValidElement(component)) return component;
  return createElement(
    component,
    buildSeparatorProps(leadingItem, trailingItem, overrides),
  );
}
