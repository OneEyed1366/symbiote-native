// Vue lifecycle wiring over the framework-agnostic core (core/tracking-transparency.ts) —
// auto-fetches the current permission status on mount (mirrors use-battery-level's
// onMounted/onUnmounted style, but there is no ongoing subscription to tear down here, just a
// one-shot get), then exposes get/request as imperative callbacks.
//
// The mount fetch has nobody to reject to, so its failure lands in the `error` ref instead of
// escaping as an unhandled rejection: a null status with a non-null error is how a consumer tells
// "the fetch failed" from "not fetched yet". get()/request() still reject to their direct caller —
// only the automatic call is made safe.
import { onMounted, ref, type Ref } from '@vue/runtime-core';
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  type PermissionResponse,
} from '../../../core';

export function usePermissions(): {
  status: Ref<PermissionResponse | null>;
  error: Ref<Error | null>;
  request: () => Promise<PermissionResponse>;
  get: () => Promise<PermissionResponse>;
} {
  const status = ref<PermissionResponse | null>(null);
  const error = ref<Error | null>(null);

  const get = async () => {
    const response = await getTrackingPermissionsAsync();
    status.value = response;
    error.value = null;
    return response;
  };

  const request = async () => {
    const response = await requestTrackingPermissionsAsync();
    status.value = response;
    error.value = null;
    return response;
  };

  onMounted(() => {
    get().catch((cause: unknown) => {
      error.value = cause instanceof Error ? cause : new Error(String(cause));
    });
  });

  return { status, error, request, get };
}
