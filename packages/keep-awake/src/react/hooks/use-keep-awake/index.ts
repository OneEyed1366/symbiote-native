// React lifecycle wiring over the framework-agnostic core (core/keep-awake.ts) — activates on
// mount, deactivates on unmount, mirroring upstream's own useKeepAwake. Uses React's useId for
// the default per-instance tag exactly like upstream, so two components calling useKeepAwake()
// concurrently without an explicit tag don't clobber each other's activation/deactivation.
//
// Upstream also checks the native module's own `addListenerForTag` presence directly before
// calling `addListener`; that private module isn't reachable from here (only core's public API
// is), so registering the listener just goes through the same promise chain — an
// UnavailabilityError from `addListener` is swallowed by the trailing `.catch(() => {})` exactly
// like a rejected `activateKeepAwakeAsync`, same net effect as upstream's own guard.
import { useEffect, useId } from 'react';
import {
  activateKeepAwakeAsync,
  addListener,
  deactivateKeepAwake,
  type KeepAwakeOptions,
} from '../../../core';

export function useKeepAwake(tag?: string, options?: KeepAwakeOptions): void {
  const defaultTag = useId();
  const tagOrDefault = tag ?? defaultTag;

  useEffect(() => {
    let isMounted = true;

    activateKeepAwakeAsync(tagOrDefault)
      .then(() => {
        if (isMounted && options?.listener) {
          addListener(tagOrDefault, options.listener);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      if (options?.suppressDeactivateWarnings) {
        deactivateKeepAwake(tagOrDefault).catch(() => {});
      } else {
        deactivateKeepAwake(tagOrDefault);
      }
    };
  }, [tagOrDefault]);
}
