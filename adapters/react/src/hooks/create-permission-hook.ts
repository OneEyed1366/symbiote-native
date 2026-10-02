// Every Expo-wrapper package's own permission hook (`useCameraPermissions`,
// `useCalendarPermissions`, `useRemindersPermissions`, ...) binds this factory to its `methods`

import { useEffect, useRef, useState } from 'react';
import {
  createPermissionApi,
  fetchInitialPermission,
  type IPermissionHookBehavior,
  type IPermissionHookMethods,
  type IPermissionHookResult,
} from '@symbiote-native/engine';

export function createPermissionHook<TPermission, TOptions extends object>(
  methods: IPermissionHookMethods<TPermission, TOptions>,
) {
  return function usePermission(
    behavior?: IPermissionHookBehavior,
    methodOptions?: TOptions,
  ): IPermissionHookResult<TPermission> {
    const [status, setStatus] = useState<TPermission | null>(null);
    const isMountedRef = useRef(true);
    const get = behavior?.get ?? true;
    const request = behavior?.request ?? false;
    const apiRef = useRef(
      createPermissionApi(methods, value => {
        if (isMountedRef.current) setStatus(value);
      }),
    );

    useEffect(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }, []);

    useEffect(() => {
      fetchInitialPermission(
        methods,
        { get, request },
        methodOptions,
        response => {
          if (isMountedRef.current) setStatus(response);
        },
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [get, request]);

    return [
      status,
      () => apiRef.current.request(methodOptions),
      () => apiRef.current.get(methodOptions),
    ];
  };
}
