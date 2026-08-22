// The listener half of a keep-awake session, plus the teardown race that comes with it:
// activation is async, so the consumer can be gone by the time it resolves. Whoever tears down
// first has to do two things - cancel an attach that hasn't run yet, AND remove a subscription
// that already landed. Miss either and the listener outlives the consumer with nothing left
// holding a reference to remove it.
//
// It lives here rather than in each adapter because the flag-plus-subscription bookkeeping is
// identical in all four; only WHERE attach/release get called differs (useEffect cleanup,
// onUnmounted, effect's onCleanup, $effect teardown). Deliberately NOT re-exported from
// core/index.ts - every framework entry does `export * from '../core'`, and this is lifecycle
// plumbing for the adapters, not public API.
import type { EventSubscription } from 'expo-modules-core';
import { addListener } from './keep-awake';
import type { KeepAwakeListener } from './types';

export type IKeepAwakeListenerAttachment = {
  /** Registers the listener for `tag`. A no-op once `release` has run, or with no listener. */
  attach: () => void;
  /** Cancels a not-yet-run `attach` and removes the subscription if one was already registered. */
  release: () => void;
};

export function createKeepAwakeListenerAttachment(
  tag: string,
  listener?: KeepAwakeListener,
): IKeepAwakeListenerAttachment {
  let isReleased = false;
  let subscription: EventSubscription | undefined;

  return {
    attach: () => {
      if (isReleased || !listener) {
        return;
      }
      subscription = addListener(tag, listener);
    },
    release: () => {
      isReleased = true;
      subscription?.remove();
      subscription = undefined;
    },
  };
}
