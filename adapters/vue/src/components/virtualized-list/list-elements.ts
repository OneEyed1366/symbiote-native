// Turning a header, footer or empty slot value into a VNode

import { h, isVNode, type Component, type VNode } from '@vue/runtime-core';
import { pickItemRenderer } from '@symbiote-native/components';
import type { IListItemInfo, IRenderItem } from './narrow-props';

// RN's `_renderElement`: the component wins over the `#item` slot. A list with neither keeps
// rendering empty cells here (the list logs it), RN would throw
export function renderCellContent<ItemT>(
  renderers: { renderItem?: IRenderItem<ItemT>; listItemComponent?: Component },
  info: IListItemInfo<ItemT>,
): VNode | VNode[] | undefined {
  const { renderItem, listItemComponent } = renderers;
  if (listItemComponent === undefined) return renderItem?.(info);
  pickItemRenderer({
    hasRenderItem: renderItem !== undefined,
    hasComponent: true,
  });
  return h(listItemComponent, info);
}

function isComponent(value: unknown): value is Component {
  return (
    typeof value === 'function' || (typeof value === 'object' && value !== null)
  );
}

// A list component element is either a Vue component (invoked via `h`) or a ready VNode, narrowed
// with `isVNode` first because a VNode is an object too
export function resolveElement(value: unknown): VNode | undefined {
  if (value === undefined || value === null) return undefined;
  if (isVNode(value)) return value;
  if (isComponent(value)) return h(value);
  return undefined;
}
