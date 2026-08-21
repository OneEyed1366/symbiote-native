// React lifecycle wiring over the framework-agnostic core (core/keep-awake.ts): activates on
// mount, deactivates on unmount, mirroring upstream's useKeepAwake. Uses React's useId for the
// default per-instance tag so concurrent callers without an explicit tag don't clobber each
// other's activation/deactivation.
//
// Upstream guards `addListener` by checking the native module's `addListenerForTag` directly;
// that's not reachable here (only core's public API is), so an UnavailabilityError from
// `addListener` is just swallowed by the trailing `.catch(() => {})` instead - same net effect.
import { useEffect, useId } from 'react';
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
  type KeepAwakeOptions,
} from '../../../core';
import { createKeepAwakeListenerAttachment } from '../../../core/listener-attachment';

export function useKeepAwake(tag?: string, options?: KeepAwakeOptions): void {
  const defaultTag = useId();
  const tagOrDefault = tag ?? defaultTag;

  useEffect(() => {
    // Per effect run, not per hook call - a changed tag tears the old attachment down with the
    // rest of the cleanup and starts a fresh one.
    const attachment = createKeepAwakeListenerAttachment(
      tagOrDefault,
      options?.listener,
    );

    activateKeepAwakeAsync(tagOrDefault)
      .then(() => attachment.attach())
      .catch(() => {});

    return () => {
      attachment.release();
      if (options?.suppressDeactivateWarnings) {
        deactivateKeepAwake(tagOrDefault).catch(() => {});
      } else {
        deactivateKeepAwake(tagOrDefault);
      }
    };
  }, [tagOrDefault]);
}
