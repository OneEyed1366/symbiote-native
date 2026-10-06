// Svelte lifecycle for a package's native view controller: the descriptor follows the props and the
// element the view is attached to becomes the host node of the controller

import type {
  ICreateNativeViewController,
  IDescriptor,
} from '@symbiote-native/components';
import { hostInstance } from '../host-instance';

export type INativeViewBinding<THandle> = {
  readonly handle: THandle;
  /** `null` means the view cannot render here and the template paints nothing */
  readonly descriptor: IDescriptor | null;
  /** For `{@attach}` on the painted element */
  attachHost: (element: unknown) => void;
};

export function useNativeViewController<THandle>(
  createController: ICreateNativeViewController<THandle>,
  getProps: () => object,
): INativeViewBinding<THandle> {
  let element: unknown = $state(null);
  const controller = createController(() => hostInstance(element) ?? null);
  const descriptor = $derived(controller.render(getProps()));

  $effect(() => () => controller.dispose?.());

  return {
    handle: controller.handle,
    get descriptor(): IDescriptor | null {
      return descriptor;
    },
    attachHost: (host: unknown): void => {
      element = host;
    },
  };
}
