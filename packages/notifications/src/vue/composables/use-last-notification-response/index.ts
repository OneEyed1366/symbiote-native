// Vue twin of `../../../react`'s `useLastNotificationResponse`

import { onMounted, onUnmounted, ref, type Ref } from '@vue/runtime-core';
import {
  addNotificationResponseClearedListener,
  addNotificationResponseReceivedListener,
  determineNextResponse,
  getLastNotificationResponse,
} from '../../../core';
import type { IMaybeNotificationResponse } from '../../../core';

export function useLastNotificationResponse(): Ref<IMaybeNotificationResponse> {
  const lastResponse = ref<IMaybeNotificationResponse>(undefined);

  onMounted(() => {
    lastResponse.value = determineNextResponse(
      lastResponse.value,
      getLastNotificationResponse(),
    );

    const subscription = addNotificationResponseReceivedListener(next => {
      lastResponse.value = determineNextResponse(lastResponse.value, next);
    });
    const clearedSubscription = addNotificationResponseClearedListener(() => {
      lastResponse.value = null;
    });

    onUnmounted(() => {
      subscription.remove();
      clearedSubscription.remove();
    });
  });

  return lastResponse;
}
