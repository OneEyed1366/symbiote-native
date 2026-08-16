// React lifecycle wiring over the framework-agnostic core (core/brightness.ts) — auto-fetches
// the current permission status on mount, then exposes get/request as imperative callbacks.
// Mirrors the shape @symbiote-native/cellular's own usePermissions ships in parallel, so both
// stay byte-for-byte consistent.
//
// The mount fetch has nobody to reject to, so its failure lands in the 4th tuple slot (`error`)
// instead of escaping as an unhandled rejection: a null status with a non-null error is how a
// consumer tells "the fetch failed" from "not fetched yet". get()/request() still reject to their
// direct caller — only the automatic call is made safe.
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
  Error | null,
] {
  const isMounted = useRef(true);
  const [status, setStatus] = useState<PermissionResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const getPermission = useCallback(async () => {
    const response = await getPermissionsAsync();
    if (isMounted.current) {
      setStatus(response);
      setError(null);
    }
    return response;
  }, []);

  const requestPermission = useCallback(async () => {
    const response = await requestPermissionsAsync();
    if (isMounted.current) {
      setStatus(response);
      setError(null);
    }
    return response;
  }, []);

  useEffect(() => {
    isMounted.current = true;
    getPermission().catch((cause: unknown) => {
      if (isMounted.current) setError(cause instanceof Error ? cause : new Error(String(cause)));
    });
    return () => {
      isMounted.current = false;
    };
  }, [getPermission]);

  return [status, requestPermission, getPermission, error];
}
