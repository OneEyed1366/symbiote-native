// Every Expo-wrapper package's own permission primitive binds this factory to its `methods`

import { createSignal, onMount, type Accessor } from 'solid-js';
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
  ): [
    Accessor<TPermission | null>,
    () => Promise<TPermission>,
    () => Promise<TPermission>,
  ] {
    const [status, setStatus] = createSignal<TPermission | null>(null);
    const api = createPermissionApi(methods, value => setStatus(() => value));

    onMount(() => {
      fetchInitialPermission(methods, behavior, methodOptions, response =>
        setStatus(() => response),
      );
    });

    return [
      status,
      () => api.request(methodOptions),
      () => api.get(methodOptions),
    ];
  };
}
