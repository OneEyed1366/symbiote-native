// Vue lifecycle wiring over the framework-agnostic core (core/tracking-transparency.ts) —
// auto-fetches the current permission status on mount (mirrors use-battery-level's
// onMounted/onUnmounted style, but there is no ongoing subscription to tear down here, just a
// one-shot get), then exposes get/request as imperative callbacks.
import { onMounted, ref, type Ref } from '@vue/runtime-core';
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  type PermissionResponse,
} from '../../../core';

export function usePermissions(): {
  status: Ref<PermissionResponse | null>;
  request: () => Promise<PermissionResponse>;
  get: () => Promise<PermissionResponse>;
} {
  const status = ref<PermissionResponse | null>(null);

  const get = async () => {
    const response = await getTrackingPermissionsAsync();
    status.value = response;
    return response;
  };

  const request = async () => {
    const response = await requestTrackingPermissionsAsync();
    status.value = response;
    return response;
  };

  onMounted(() => {
    void get();
  });

  return { status, request, get };
}
