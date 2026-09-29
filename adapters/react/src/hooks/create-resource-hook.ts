// Every `useReleasingSharedObject`-style hook (`useAudioPlayer`, `useImageManipulator`, ...)
// binds this to its own `createXController()` instead of repeating the ref/effect wiring

import { useEffect, useRef } from 'react';

export type IResourceHookController<TArgs extends unknown[], TResource> = {
  resolve: (...args: TArgs) => TResource;
  flushDispose: () => void;
  dispose: () => void;
};

export function createResourceHook<TArgs extends unknown[], TResource>(
  createController: () => IResourceHookController<TArgs, TResource>,
) {
  return function useResource(...args: TArgs): TResource {
    const controllerRef = useRef<IResourceHookController<
      TArgs,
      TResource
    > | null>(null);
    if (!controllerRef.current) controllerRef.current = createController();
    const resource = controllerRef.current.resolve(...args);

    useEffect(() => {
      controllerRef.current?.flushDispose();
    }, [resource]);

    useEffect(() => {
      return () => controllerRef.current?.dispose();
    }, []);

    return resource;
  };
}
