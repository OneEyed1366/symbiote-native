import { splitProps } from 'solid-js';
import type { JSX } from 'solid-js';
import type { IDescriptor } from '@symbiote-native/components';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { descriptorToSolid } from './descriptor-to-solid';

// A component whose host is one shared render function: children are the caller's own and go
// inside the host, every other prop reaches the render function
export function defineDescriptorComponent<P extends { children?: JSX.Element }>(
  render: (props: object) => IDescriptor,
): (props: P) => ISymbioteNode {
  return props => {
    const [, rest] = splitProps(props, ['children']);
    return descriptorToSolid(
      () => render({ ...rest }),
      () => props.children,
    );
  };
}
