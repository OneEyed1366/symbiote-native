// Every `useReleasingSharedObject`-style composable (`useAudioPlayer`, `useImageManipulator`, ...)
// binds this to its own `createXController()` instead of repeating the computed/watch wiring

import {
  computed,
  onUnmounted,
  watch,
  type ComputedRef,
} from '@vue/runtime-core';

export type IResourceHookController<TArgs extends unknown[], TResource> = {
  resolve: (...args: TArgs) => TResource;
  flushDispose: () => void;
  dispose: () => void;
};

export function createResourceHook<TArgs extends unknown[], TResource>(
  createController: () => IResourceHookController<TArgs, TResource>,
) {
  return function useResource(getArgs: () => TArgs): ComputedRef<TResource> {
    const controller = createController();
    const resource = computed(() => controller.resolve(...getArgs()));

    watch(resource, () => {
      controller.flushDispose();
    });

    onUnmounted(() => controller.dispose());

    return resource;
  };
}
