// Boxed-getter shape matches `@symbiote-native/brightness`'s own rune by design - each package
// owns its copy rather than depend on a sibling install-optional package

import { getPermissionsAsync, requestPermissionsAsync } from '../core';
import type { PermissionResponse } from '../core';
import { createPermissionsApi } from '../core/permissions-runtime';

export function usePermissions(): {
  readonly status: PermissionResponse | null;
  readonly error: Error | null;
  request: () => Promise<PermissionResponse>;
  get: () => Promise<PermissionResponse>;
} {
  let status = $state<PermissionResponse | null>(null);
  let error = $state<Error | null>(null);
  const api = createPermissionsApi(
    getPermissionsAsync,
    requestPermissionsAsync,
    response => {
      status = response;
      error = null;
    },
  );

  $effect(() => {
    api.get().catch((cause: unknown) => {
      error = cause instanceof Error ? cause : new Error(String(cause));
    });
  });

  return {
    get status(): PermissionResponse | null {
      return status;
    },
    get error(): Error | null {
      return error;
    },
    request: api.request,
    get: api.get,
  };
}
