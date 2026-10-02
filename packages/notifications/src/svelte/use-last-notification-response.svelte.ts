// Boxed-getter shape matches `@symbiote-native/screen-capture`'s own runes by design - each
// package owns its copy rather than depend on a sibling install-optional package

import { untrack } from 'svelte';
import {
  addNotificationResponseClearedListener,
  addNotificationResponseReceivedListener,
  determineNextResponse,
  getLastNotificationResponse,
} from '../core';
import type { IMaybeNotificationResponse } from '../core';

export function useLastNotificationResponse(): {
  readonly current: IMaybeNotificationResponse;
} {
  let lastResponse = $state<IMaybeNotificationResponse>(undefined);

  $effect(() => {
    lastResponse = determineNextResponse(
      untrack(() => lastResponse),
      getLastNotificationResponse(),
    );

    const subscription = addNotificationResponseReceivedListener(next => {
      lastResponse = determineNextResponse(
        untrack(() => lastResponse),
        next,
      );
    });
    const clearedSubscription = addNotificationResponseClearedListener(() => {
      lastResponse = null;
    });

    return () => {
      subscription.remove();
      clearedSubscription.remove();
    };
  });

  return {
    get current(): IMaybeNotificationResponse {
      return lastResponse;
    },
  };
}
