// The descriptor→element bridge. A render function in @symbiote-native/components returns a
// framework-agnostic `Descriptor` tree; this maps it onto React elements. The resulting
// host element (`symbiote-view`, `symbiote-activity-indicator`, …) flows on through the
// react-reconciler host config → engine → Fabric, exactly like a hand-written JSX host
// element.

import { createElement } from 'react';
import type { ReactElement } from 'react';
import type { IDescriptor, IDescriptorChild } from '@symbiote-native/components';

export function descriptorToReact(node: IDescriptor, index?: number): ReactElement {
  const children = node.children.map(toChild);
  // `key` first so a Descriptor that carries its own `key` in props still wins; list
  // items (once components emit keyed children) diff correctly.
  return createElement(node.type, { key: node.key ?? index, ...node.props }, ...children);
}

function toChild(child: IDescriptorChild, index: number): ReactElement | string {
  return typeof child === 'string' ? child : descriptorToReact(child, index);
}
