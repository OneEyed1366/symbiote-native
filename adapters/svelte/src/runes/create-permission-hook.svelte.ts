// Svelte lifecycle for the shared permission API, boxed getter because a bare `$state` can't cross
// a module boundary. Packages reach it through the `@symbiote-native/svelte/runes/*` subpath

import {
  createPermissionApi,
  fetchInitialPermission,
  type IPermissionHookBehavior,
  type IPermissionHookMethods,
} from '@symbiote-native/engine';

export function createPermissionHook<TPermission, TOptions extends object>(
  methods: IPermissionHookMethods<TPermission, TOptions>,
) {
  return function usePermission(
    behavior?: IPermissionHookBehavior,
    methodOptions?: TOptions,
  ): {
    readonly status: TPermission | null;
    requestPermission: () => Promise<TPermission>;
    getPermission: () => Promise<TPermission>;
  } {
    let status = $state<TPermission | null>(null);
    const api = createPermissionApi(methods, value => {
      status = value;
    });

    $effect(() => {
      fetchInitialPermission(methods, behavior, methodOptions, response => {
        status = response;
      });
    });

    return {
      get status(): TPermission | null {
        return status;
      },
      requestPermission: () => api.request(methodOptions),
      getPermission: () => api.get(methodOptions),
    };
  };
}
