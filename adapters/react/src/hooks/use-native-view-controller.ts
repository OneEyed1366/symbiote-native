import { useEffect, useImperativeHandle, useState } from 'react';
import type { ReactElement, Ref } from 'react';
import { createHostNodeHolder } from '@symbiote-native/components';
import type { ICreateNativeViewController } from '@symbiote-native/components';
import { descriptorToReact } from '../descriptor-to-react';

// The body of a React component over a package's native view: one controller per mounted view,
// its handle goes to the `ref` and its descriptor is bridged to an element
export function useNativeViewController<THandle>(
  ref: Ref<THandle> | undefined,
  createController: ICreateNativeViewController<THandle>,
  props: object,
): ReactElement | null {
  const [{ host, controller }] = useState(() => {
    const holder = createHostNodeHolder();
    return { host: holder, controller: createController(holder.getNode) };
  });
  useImperativeHandle(ref, () => controller.handle, [controller]);
  useEffect(() => () => controller.dispose?.(), [controller]);
  const descriptor = controller.render(props);
  return descriptor ? descriptorToReact(host.capture(descriptor)) : null;
}
