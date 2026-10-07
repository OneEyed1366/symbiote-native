import type { IDescriptor } from '@symbiote-native/components';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { descriptorToSolid } from './descriptor-to-solid';

// A childless component whose render function may answer `null`, for a native view that exists
// on one platform only. The answer is decided once at mount: the bridge builds the node once
// and then only diffs prop values, so the descriptor's shape must not change afterwards
export function defineOptionalDescriptorComponent<P extends object>(
  render: (props: object) => IDescriptor | null,
): (props: P) => ISymbioteNode | null {
  return props => {
    const initial = render({ ...props });
    if (!initial) return null;
    return descriptorToSolid(() => render({ ...props }) ?? initial);
  };
}
