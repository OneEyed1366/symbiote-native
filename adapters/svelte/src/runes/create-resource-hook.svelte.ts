// Svelte lifecycle for a disposable resource derived from reactive args, boxed getter as in
// `use-color-scheme.svelte.ts`

export type IResourceHookController<TArgs extends unknown[], TResource> = {
  resolve: (...args: TArgs) => TResource;
  flushDispose: (current: TResource) => void;
  dispose: () => void;
};

export function createResourceHook<TArgs extends unknown[], TResource>(
  createController: () => IResourceHookController<TArgs, TResource>,
) {
  return function useResource(getArgs: () => TArgs): {
    readonly current: TResource;
  } {
    const controller = createController();
    const resource = $derived(controller.resolve(...getArgs()));

    $effect(() => {
      controller.flushDispose(resource);
    });

    $effect(() => {
      return () => controller.dispose();
    });

    return {
      get current(): TResource {
        return resource;
      },
    };
  };
}
