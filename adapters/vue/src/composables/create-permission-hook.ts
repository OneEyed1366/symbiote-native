// Every Expo-wrapper package's own permission composable (`useCameraPermissions`,
// `useCalendarPermissions`, `useRemindersPermissions`, ...) binds this factory to its `methods`

import { onMounted, shallowRef, type Ref } from '@vue/runtime-core';
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
    Ref<TPermission | null>,
    () => Promise<TPermission>,
    () => Promise<TPermission>,
  ] {
    const status = shallowRef<TPermission | null>(null);
    const api = createPermissionApi(methods, value => {
      status.value = value;
    });

    onMounted(() => {
      fetchInitialPermission(methods, behavior, methodOptions, response => {
        status.value = response;
      });
    });

    return [
      status,
      () => api.request(methodOptions),
      () => api.get(methodOptions),
    ];
  };
}
