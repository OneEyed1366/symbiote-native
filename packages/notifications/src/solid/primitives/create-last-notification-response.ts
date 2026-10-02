// Solid twin of `../../react`'s `useLastNotificationResponse`

import { createSignal, onCleanup, onMount, type Accessor } from 'solid-js';
import {
  addNotificationResponseClearedListener,
  addNotificationResponseReceivedListener,
  determineNextResponse,
  getLastNotificationResponse,
} from '../../core';
import type { IMaybeNotificationResponse } from '../../core';

export function createLastNotificationResponse(): Accessor<IMaybeNotificationResponse> {
  const [lastResponse, setLastResponse] =
    createSignal<IMaybeNotificationResponse>(undefined);

  onMount(() => {
    setLastResponse(prev =>
      determineNextResponse(prev, getLastNotificationResponse()),
    );

    const subscription = addNotificationResponseReceivedListener(next => {
      setLastResponse(prev => determineNextResponse(prev, next));
    });
    const clearedSubscription = addNotificationResponseClearedListener(() => {
      setLastResponse(null);
    });

    onCleanup(() => {
      subscription.remove();
      clearedSubscription.remove();
    });
  });

  return lastResponse;
}
