// Vue lifecycle wiring over core/screen-capture.ts. The mount fetch has nobody to reject to,
// so its failure lands in `error` instead of escaping as an unhandled rejection

import { onMounted, ref, type Ref } from '@vue/runtime-core';
import { getPermissionsAsync, requestPermissionsAsync } from '../../../core';
import type { PermissionResponse } from '../../../core';
import { createPermissionsApi } from '../../../core/permissions-runtime';

export function usePermissions(): {
  status: Ref<PermissionResponse | null>;
  error: Ref<Error | null>;
  request: () => Promise<PermissionResponse>;
  get: () => Promise<PermissionResponse>;
} {
  const status = ref<PermissionResponse | null>(null);
  const error = ref<Error | null>(null);
  const api = createPermissionsApi(
    getPermissionsAsync,
    requestPermissionsAsync,
    response => {
      status.value = response;
      error.value = null;
    },
  );

  onMounted(() => {
    api.get().catch((cause: unknown) => {
      error.value = cause instanceof Error ? cause : new Error(String(cause));
    });
  });

  return { status, error, request: api.request, get: api.get };
}
