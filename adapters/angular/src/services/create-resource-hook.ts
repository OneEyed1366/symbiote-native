// Every `useReleasingSharedObject`-style `injectX` (`injectAudioPlayer`, `injectImageManipulator`,
// ...) binds this to its own `createXController()` factory instead of repeating the wiring

import { DestroyRef, effect, inject, signal, type Signal } from '@angular/core';

export type IResourceHookController<TArgs extends unknown[], TResource> = {
  resolve: (...args: TArgs) => TResource;
  flushDispose: () => void;
  dispose: () => void;
};

export function createResourceHook<TArgs extends unknown[], TResource>(
  createController: () => IResourceHookController<TArgs, TResource>,
) {
  return function injectResource(getArgs: () => TArgs): Signal<TResource> {
    const controller = createController();
    const resource = signal(controller.resolve(...getArgs()));

    effect(() => {
      resource.set(controller.resolve(...getArgs()));
    });

    effect(() => {
      resource();
      controller.flushDispose();
    });

    inject(DestroyRef).onDestroy(() => controller.dispose());

    return resource.asReadonly();
  };
}
