// React twin of expo-notifications' `useLastNotificationResponse`. `useLayoutEffect` matches
// upstream's own choice - the listener must register before paint

import { useLayoutEffect, useState } from 'react';
import {
  addNotificationResponseClearedListener,
  addNotificationResponseReceivedListener,
  determineNextResponse,
  getLastNotificationResponse,
} from '../../../core';
import type { IMaybeNotificationResponse } from '../../../core';

export function useLastNotificationResponse(): IMaybeNotificationResponse {
  const [lastResponse, setLastResponse] =
    useState<IMaybeNotificationResponse>(undefined);

  useLayoutEffect(() => {
    const response = getLastNotificationResponse();
    setLastResponse(prev => determineNextResponse(prev, response));

    const subscription = addNotificationResponseReceivedListener(next => {
      setLastResponse(prev => determineNextResponse(prev, next));
    });
    const clearedSubscription = addNotificationResponseClearedListener(() => {
      setLastResponse(null);
    });

    return () => {
      subscription.remove();
      clearedSubscription.remove();
    };
  }, []);

  return lastResponse;
}
