// Svelte lifecycle wiring over the framework-agnostic core (core/tracking-transparency.ts) —
// auto-fetches the current permission status on mount, then exposes get/request as imperative
// callbacks. There is no ongoing subscription to tear down here, just a one-shot get, so the
// `$effect` returns no cleanup.
//
// `.svelte.ts` (not `.ts`): runes ($state/$effect) are only usable in files with this extension
// outside an actual `.svelte` component. `runes/` is Svelte's own term for the lifecycle bucket,
// per CLAUDE.md's <adapter_src_follows_framework_idioms> — React calls it `hooks/`, Vue
// `composables/`. `status` is handed back as a getter on the returned object, NOT as a bare
// `$state`: Svelte 5 reactivity is lexically scoped to the declaring module and does not survive
// being returned as a raw value from a plain function. The returned shape mirrors Vue's
// `{ status, request, get }` — Vue's `Ref` unwrapped via `.value`, Svelte's via the getter.
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  type PermissionResponse,
} from '../../core';

export function usePermissions(): {
  readonly status: PermissionResponse | null;
  request: () => Promise<PermissionResponse>;
  get: () => Promise<PermissionResponse>;
} {
  let status = $state<PermissionResponse | null>(null);

  const get = async (): Promise<PermissionResponse> => {
    const response = await getTrackingPermissionsAsync();
    status = response;
    return response;
  };

  const request = async (): Promise<PermissionResponse> => {
    const response = await requestTrackingPermissionsAsync();
    status = response;
    return response;
  };

  $effect(() => {
    // `get` is a plain closure, not reactive state, so the effect has an empty dependency set and
    // runs exactly once on mount — the twin of Vue's onMounted.
    void get();
  });

  return {
    get status(): PermissionResponse | null {
      return status;
    },
    request,
    get,
  };
}
