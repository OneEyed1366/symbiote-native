// createPermissions — the Solid twin of React's `usePermissions` hook, Vue's composable and
// Svelte's rune, over the framework-agnostic core (core/tracking-transparency.ts). Auto-fetches
// the current permission status, then exposes get/request as imperative callbacks.
//
// `primitives/` and `create*`, never `hooks/`+`use*`: Solid's ecosystem calls a composable
// reactive function a PRIMITIVE and reserves `use*` for consuming something that already exists.
// Full rationale in adapters/solid/src/primitives/create-color-scheme.ts.
//
// Returns ACCESSORS, never snapshots: a Solid component body runs ONCE, so returned values would
// pin the caller to the null pre-fetch state forever.
//
// The auto-fetch fires from the primitive body rather than a mount effect — the shape
// `createResource` uses, and the reason this primitive needs no lifecycle hook at all. Its failure
// lands in `error` instead of escaping as an unhandled rejection: a null status with a non-null
// error is how a consumer tells "the fetch failed" from "not fetched yet". get()/request() still
// reject to their direct caller — only the automatic call is made safe.
//
// No isMounted guard around the late write, unlike React's hook: once the owning root is disposed
// nothing is subscribed to these signals any more, so a resolution arriving afterwards is inert.

import { createSignal, type Accessor } from 'solid-js';
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  type PermissionResponse,
} from '../../core';

export function createPermissions(): {
  status: Accessor<PermissionResponse | null>;
  error: Accessor<Error | null>;
  request: () => Promise<PermissionResponse>;
  get: () => Promise<PermissionResponse>;
} {
  const [status, setStatus] = createSignal<PermissionResponse | null>(null);
  const [error, setError] = createSignal<Error | null>(null);

  const get = async (): Promise<PermissionResponse> => {
    const response = await getTrackingPermissionsAsync();
    setStatus(response);
    setError(null);
    return response;
  };

  const request = async (): Promise<PermissionResponse> => {
    const response = await requestTrackingPermissionsAsync();
    setStatus(response);
    setError(null);
    return response;
  };

  get().catch((cause: unknown) => {
    setError(cause instanceof Error ? cause : new Error(String(cause)));
  });

  return { status, error, request, get };
}
