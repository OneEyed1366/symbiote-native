// Small element builders shared by the list's child walk

import { createElement, type ComponentType, type ReactNode } from 'react';
import {
  buildSeparatorProps,
  type ISeparatorProps,
} from '@symbiote-native/components';
import type { IListSlot } from './virtualized-list-props';

export function resolveElement(component: IListSlot): ReactNode {
  if (component === undefined) return undefined;
  if (typeof component === 'function') return createElement(component, {});
  return component;
}

// The `ItemSeparatorComponent` element for the gap between two items, with the highlight flag and
// any handle-pushed overrides merged on top, RN renders `<ItemSeparatorComponent {...props} />`
export function renderSeparatorElement<ItemT>(
  component: ComponentType<ISeparatorProps<ItemT>> | undefined,
  leadingItem: ItemT,
  trailingItem: ItemT,
  overrides: Partial<ISeparatorProps<ItemT>> | undefined,
): ReactNode {
  if (component === undefined) return undefined;
  return createElement(
    component,
    buildSeparatorProps(leadingItem, trailingItem, overrides),
  );
}
