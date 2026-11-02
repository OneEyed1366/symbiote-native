// Solid `ScreenContainer`: core picks the native view, other props go through as they are
// The view name is read once at mount, as a host element cannot change its native class

import { splitProps } from 'solid-js';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { insert } from '@symbiote-native/solid/renderer';
import { Platform } from '@symbiote-native/solid';
import { resolveScreenContainerViewName } from '../core';
import type { IScreenContainerProps } from '../core';
import { hostElement } from './host';

export type ISolidScreenContainerProps = JSX.IntrinsicElements['view'] &
  IScreenContainerProps;

export function ScreenContainer(
  props: ISolidScreenContainerProps,
): JSX.Element {
  const [, viewProps] = splitProps(props, [
    'children',
    'enabled',
    'hasTwoStates',
  ]);
  const viewName = resolveScreenContainerViewName({
    enabled: props.enabled,
    hasTwoStates: props.hasTwoStates,
    os: Platform.OS,
  });
  const node = hostElement(viewName, () => ({ ...viewProps }));
  insert(node, () => props.children);
  return node;
}
