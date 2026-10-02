// Same shape as `@symbiote-native/brightness`'s own `usePermissions` by design - each package
// owns its copy. The mount fetch has nobody to reject to, so its failure lands in the 4th
// tuple slot (`error`)

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPermissionsAsync, requestPermissionsAsync } from '../../../core';
import type { PermissionResponse } from '../../../core';

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
      if (isMounted.current)
        setError(cause instanceof Error ? cause : new Error(String(cause)));
    });
    return () => {
      isMounted.current = false;
    };
  }, [getPermission]);

  return [status, requestPermission, getPermission, error];
}
