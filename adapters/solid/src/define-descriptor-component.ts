import { splitProps } from 'solid-js';
import type { JSX } from 'solid-js';
import type { IDescriptor } from '@symbiote-native/components';
import type { ISymbioteNode } from '@symbiote-native/engine';
import type { IViewProps } from './components/view-props';
import { descriptorToSolid } from './descriptor-to-solid';

// A component over one shared render function: the app's children go inside the host
// Every other prop, `class` included, reaches the render function
export function defineDescriptorComponent<P extends { children?: JSX.Element }>(
  render: (props: object) => IDescriptor,
): (props: P & Pick<IViewProps, 'class'>) => ISymbioteNode {
  return props => {
    const [, rest] = splitProps(props, ['children']);
    return descriptorToSolid(
      () => render({ ...rest }),
      () => props.children,
    );
  };
}
