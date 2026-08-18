// Solid lifecycle wiring over the framework-agnostic core (core/cellular.ts) — the Solid twin of
// React's usePermissions hook, Vue's composable, Svelte's rune and Angular's PermissionsService.
//
// `primitives/` and `create*`, not `hooks/`/`use*`: Solid's ecosystem calls a composable reactive
// function a PRIMITIVE and reserves `use*` for consuming something that already exists. Full
// rationale in adapters/solid/src/primitives/create-color-scheme.ts's header.
//
// Returns ACCESSORS, never a snapshot: a Solid component body runs ONCE, so a plain returned value
// would freeze at "not fetched yet" and never move again.
//
// The initial fetch is fired SYNCHRONOUSLY from the primitive body rather than from a mount hook
// (React's useEffect, Vue's onMounted, Svelte's $effect) — same reason create-color-scheme
// subscribes synchronously: nothing can interleave between construction and the fetch starting, so
// there is no window in which a consumer sees a primitive that has not asked for status yet.
//
// That fetch has nobody to reject to, so its failure lands in `error` instead of escaping as an
// unhandled rejection: a null status with a non-null error is how a consumer tells "the fetch
// failed" from "not fetched yet". get()/request() still reject to their direct caller — only the
// automatic call is made safe.
//
// `onCleanup` drops the writes of a call still in flight when the owner is disposed — the Solid
// equivalent of React's isMounted ref. Outside a component / createRoot there is no owner to hang
// it on, so those late writes land instead (harmless: nothing reads a disposed signal).
import { createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
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
  let isDisposed = false;

  const record = (response: PermissionResponse): void => {
    if (isDisposed) return;
    setStatus(response);
    setError(null);
  };

  const get = async (): Promise<PermissionResponse> => {
    const response = await getPermissionsAsync();
    record(response);
    return response;
  };

  const request = async (): Promise<PermissionResponse> => {
    const response = await requestPermissionsAsync();
    record(response);
    return response;
  };

  get().catch((cause: unknown) => {
    if (isDisposed) return;
    setError(cause instanceof Error ? cause : new Error(String(cause)));
  });

  onCleanup(() => {
    isDisposed = true;
  });

  return { status, error, request, get };
}
