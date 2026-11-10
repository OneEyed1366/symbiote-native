// Solid `ScreenFooter`: the native footer view of a `formSheet`, view props go through as they are

import { splitProps } from 'solid-js';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { insert } from '@symbiote-native/solid/renderer';
import { RNS_SCREEN_FOOTER_VIEW_NAME } from '../core';
import { hostElement } from './host';

export type ISolidScreenFooterProps = JSX.IntrinsicElements['view'];

export function ScreenFooter(props: ISolidScreenFooterProps): JSX.Element {
  const [, viewProps] = splitProps(props, ['children']);
  const node = hostElement(RNS_SCREEN_FOOTER_VIEW_NAME, () => ({
    ...viewProps,
  }));
  insert(node, () => props.children);
  return node;
}
