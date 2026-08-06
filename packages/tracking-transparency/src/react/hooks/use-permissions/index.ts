// React lifecycle wiring over the framework-agnostic core (core/tracking-transparency.ts) —
// auto-fetches the current permission status on mount, then exposes get/request as imperative
// callbacks. Mirrors the shape @symbiote-native/cellular's own usePermissions ships in parallel,
// so both stay byte-for-byte consistent.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  type PermissionResponse,
} from '../../../core';

export function usePermissions(): [
  PermissionResponse | null,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
] {
  const isMounted = useRef(true);
  const [status, setStatus] = useState<PermissionResponse | null>(null);

  const getPermission = useCallback(async () => {
    const response = await getTrackingPermissionsAsync();
    if (isMounted.current) setStatus(response);
    return response;
  }, []);

  const requestPermission = useCallback(async () => {
    const response = await requestTrackingPermissionsAsync();
    if (isMounted.current) setStatus(response);
    return response;
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void getPermission();
    return () => {
      isMounted.current = false;
    };
  }, [getPermission]);

  return [status, requestPermission, getPermission];
}
