// Solid lifecycle wiring over core/screen-capture.ts. The synchronous fetch has nobody to reject
// to, so its failure lands in `error` instead of escaping as an unhandled rejection

import { createSignal, onCleanup, type Accessor } from 'solid-js';
import { getPermissionsAsync, requestPermissionsAsync } from '../../core';
import type { PermissionResponse } from '../../core';
import { createPermissionsApi } from '../../core/permissions-runtime';

export function createPermissions(): {
  status: Accessor<PermissionResponse | null>;
  error: Accessor<Error | null>;
  request: () => Promise<PermissionResponse>;
  get: () => Promise<PermissionResponse>;
} {
  const [status, setStatus] = createSignal<PermissionResponse | null>(null);
  const [error, setError] = createSignal<Error | null>(null);
  let isDisposed = false;

  const api = createPermissionsApi(
    getPermissionsAsync,
    requestPermissionsAsync,
    response => {
      if (isDisposed) return;
      setStatus(response);
      setError(null);
    },
  );

  api.get().catch((cause: unknown) => {
    if (isDisposed) return;
    setError(cause instanceof Error ? cause : new Error(String(cause)));
  });

  onCleanup(() => {
    isDisposed = true;
  });

  return { status, error, request: api.request, get: api.get };
}
