// Svelte lifecycle wiring over the framework-agnostic core (core/brightness.ts) — auto-fetches
// the current permission status on mount, then exposes get/request as imperative callbacks. The
// Svelte twin of vue/composables/use-permissions and react/hooks/use-permissions.
//
// `.svelte.ts` (not `.ts`): runes ($state/$effect) are only usable in a file with this extension
// outside an actual `.svelte` component. `runes/` is Svelte's own term for the bucket React calls
// `hooks/` and Vue calls `composables/` — see adapters/svelte/src/runes.
//
// Vue's onMounted collapses into a `$effect` with no teardown (there is no ongoing subscription
// here, just a one-shot get). The effect only WRITES `status` (through `get()`), never reads it,
// so its dependency set stays empty and it fires exactly once on mount.
//
// `status` comes back as a GETTER on the returned object rather than a raw `$state` variable:
// Svelte 5 reactivity is lexically scoped to the declaring module, so a raw `let x = $state(...)`
// handed out of a plain function arrives dead at the caller. Reading `.status` is the Svelte
// equivalent of unwrapping Vue's `Ref` via `.value`.
import { getPermissionsAsync, requestPermissionsAsync, type PermissionResponse } from '../../core';

export function usePermissions(): {
  readonly status: PermissionResponse | null;
  request: () => Promise<PermissionResponse>;
  get: () => Promise<PermissionResponse>;
} {
  let status = $state<PermissionResponse | null>(null);

  const get = async (): Promise<PermissionResponse> => {
    const response = await getPermissionsAsync();
    status = response;
    return response;
  };

  const request = async (): Promise<PermissionResponse> => {
    const response = await requestPermissionsAsync();
    status = response;
    return response;
  };

  $effect(() => {
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
