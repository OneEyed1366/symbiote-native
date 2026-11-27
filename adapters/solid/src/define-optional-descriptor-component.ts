import type { IDescriptor } from '@symbiote-native/components';
import type { ISymbioteNode } from '@symbiote-native/engine';
import type { IViewProps } from './components/view-props';
import { descriptorToSolid } from './descriptor-to-solid';

// A childless component for a native view of one platform, its render may answer `null`
// That is decided once at mount, so the shape of the descriptor must not change afterwards
export function defineOptionalDescriptorComponent<P extends object>(
  render: (props: object) => IDescriptor | null,
): (props: P & Pick<IViewProps, 'class'>) => ISymbioteNode | null {
  return props => {
    const initial = render({ ...props });
    if (!initial) return null;
    return descriptorToSolid(() => render({ ...props }) ?? initial);
  };
}
