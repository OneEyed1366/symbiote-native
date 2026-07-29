// React lifecycle wiring over the framework-agnostic core (core/cellular.ts) — fetches the
// current permission status on mount, then exposes request/get to re-check imperatively.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
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
    const response = await getPermissionsAsync();
    if (isMounted.current) setStatus(response);
    return response;
  }, []);

  const requestPermission = useCallback(async () => {
    const response = await requestPermissionsAsync();
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
