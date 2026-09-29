// Every `useReleasingSharedObject`-style primitive (`useAudioPlayer`, `useImageManipulator`, ...)
// binds this to its own `createXController()` instead of repeating the memo/effect wiring

import { createEffect, createMemo, onCleanup, type Accessor } from 'solid-js';

export type IResourceHookController<TArgs extends unknown[], TResource> = {
  resolve: (...args: TArgs) => TResource;
  flushDispose: () => void;
  dispose: () => void;
};

export function createResourceHook<TArgs extends unknown[], TResource>(
  createController: () => IResourceHookController<TArgs, TResource>,
) {
  return function useResource(getArgs: () => TArgs): Accessor<TResource> {
    const controller = createController();
    const resource = createMemo(() => controller.resolve(...getArgs()));

    createEffect(() => {
      resource();
      controller.flushDispose();
    });

    onCleanup(() => controller.dispose());

    return resource;
  };
}
