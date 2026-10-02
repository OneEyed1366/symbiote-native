// Framework-agnostic twin of expo-notifications' `determineNextResponse` - every adapter's
// `useLastNotificationResponse` shares this dedup rule instead of re-deriving it

import type {
  IMaybeNotificationResponse,
  INotificationResponse,
} from './types';

export function determineNextResponse(
  prevResponse: IMaybeNotificationResponse,
  newResponse: INotificationResponse | null,
): IMaybeNotificationResponse {
  if (!newResponse) return null;
  if (!prevResponse) return newResponse;
  return prevResponse.notification.request.identifier !==
    newResponse.notification.request.identifier
    ? newResponse
    : prevResponse;
}
