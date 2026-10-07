import { onCleanup, splitProps } from 'solid-js';
import { createHostNodeHolder } from '@symbiote-native/components';
import type { ICreateNativeViewController } from '@symbiote-native/components';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { descriptorToSolid } from '../descriptor-to-solid';

// A Solid component over a package's native view: the props go to the controller, its handle goes
// to `ref`. The shape of the descriptor is decided once at mount, only values change afterwards
export function defineNativeViewComponent<THandle, TProps extends object>(
  createController: ICreateNativeViewController<THandle>,
) {
  return (
    props: TProps & { ref?: (handle: THandle) => void },
  ): ISymbioteNode | null => {
    const [own, viewProps] = splitProps(props, ['ref']);
    const host = createHostNodeHolder();
    const controller = createController(host.getNode);
    onCleanup(() => controller.dispose?.());
    const render = () => {
      const descriptor = controller.render({ ...viewProps });
      return descriptor && host.capture(descriptor);
    };
    const initial = render();
    if (!initial) return null;
    own.ref?.(controller.handle);
    return descriptorToSolid(() => render() ?? initial);
  };
}
