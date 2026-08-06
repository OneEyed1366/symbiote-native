// Vue lifecycle wiring over the framework-agnostic core (core/cellular.ts) — fetches the
// current permission status on mount, then exposes request/get to re-check imperatively.
import { onMounted, ref, type Ref } from '@vue/runtime-core';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
  type PermissionResponse,
} from '../../../core';

export function usePermissions(): {
  status: Ref<PermissionResponse | null>;
  request: () => Promise<PermissionResponse>;
  get: () => Promise<PermissionResponse>;
} {
  const status = ref<PermissionResponse | null>(null);

  const get = async () => {
    const response = await getPermissionsAsync();
    status.value = response;
    return response;
  };

  const request = async () => {
    const response = await requestPermissionsAsync();
    status.value = response;
    return response;
  };

  onMounted(() => {
    void get();
  });

  return { status, request, get };
}
