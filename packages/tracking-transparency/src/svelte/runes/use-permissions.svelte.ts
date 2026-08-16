// Svelte lifecycle wiring over the framework-agnostic core (core/tracking-transparency.ts) —
// auto-fetches the current permission status on mount, then exposes get/request as imperative
// callbacks. Just a one-shot get with no ongoing subscription, so `$effect` needs no cleanup.
//
// `.svelte.ts` (not `.ts`): runes ($state/$effect) only work in files with this extension
// outside an actual `.svelte` component. `status` is returned as a getter, NOT a bare
// `$state`: Svelte 5 reactivity is lexically scoped to the declaring module and doesn't
// survive being returned as a raw value from a plain function — mirrors how Vue's `Ref`
// needs `.value` to unwrap.
//
// The mount fetch has nobody to reject to, so its failure lands in `error` (a second boxed getter,
// same reason as `status`) instead of escaping as an unhandled rejection: a null status with a
// non-null error is how a consumer tells "the fetch failed" from "not fetched yet".
// get()/request() still reject to their direct caller — only the automatic call is made safe.
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  type PermissionResponse,
} from '../../core';

export function usePermissions(): {
  readonly status: PermissionResponse | null;
  readonly error: Error | null;
  request: () => Promise<PermissionResponse>;
  get: () => Promise<PermissionResponse>;
} {
  let status = $state<PermissionResponse | null>(null);
  let error = $state<Error | null>(null);

  const get = async (): Promise<PermissionResponse> => {
    const response = await getTrackingPermissionsAsync();
    status = response;
    error = null;
    return response;
  };

  const request = async (): Promise<PermissionResponse> => {
    const response = await requestTrackingPermissionsAsync();
    status = response;
    error = null;
    return response;
  };

  $effect(() => {
    // `get` is a plain closure, not reactive state, so the effect has an empty dependency set and
    // runs exactly once on mount — the twin of Vue's onMounted. The catch runs after the effect
    // has settled, so writing `error` there adds no dependency and does not re-arm it.
    get().catch((cause: unknown) => {
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
    request,
    get,
  };
}
