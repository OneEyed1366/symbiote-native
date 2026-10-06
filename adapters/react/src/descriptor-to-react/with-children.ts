import { createElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { IDescriptor } from '@symbiote-native/components';
import { descriptorToReact } from './index';

/** The element of a descriptor with the app children after its own, for wrappers */
export function descriptorToReactWithChildren(
  node: IDescriptor,
  children: ReactNode,
): ReactElement {
  return createElement(
    node.type,
    node.props,
    ...node.children.map(child =>
      typeof child === 'string' ? child : descriptorToReact(child),
    ),
    children,
  );
}
