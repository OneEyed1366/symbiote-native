// Ported from expo-notifications @ sdk-57's NotificationsEmitter.ts.
import {
  LegacyEventEmitter,
  UnavailabilityError,
  type EventSubscription,
} from 'expo-modules-core';

import { dlog } from '@symbiote-native/engine';

import { notificationsEmitterModule } from './native-modules';
import type { INotification, INotificationResponse } from './types';
import { mapNotification, mapNotificationResponse } from './utils';

const emitter = new LegacyEventEmitter(notificationsEmitterModule);

const RECEIVED_EVENT = 'onDidReceiveNotification';
const DROPPED_EVENT = 'onNotificationsDeleted';
const RESPONSE_RECEIVED_EVENT = 'onDidReceiveNotificationResponse';
const RESPONSE_CLEARED_EVENT = 'onDidClearNotificationResponse';

export const DEFAULT_ACTION_IDENTIFIER =
  'expo.modules.notifications.actions.DEFAULT';

/** Fires whenever a notification is received while the app is running. */
export function addNotificationReceivedListener(
  listener: (event: INotification) => void,
): EventSubscription {
  return emitter.addListener<INotification>(RECEIVED_EVENT, notification => {
    dlog(() => `[notifications] received ${notification.request.identifier}`);
    listener(mapNotification(notification));
  });
}

/**
 * Fires whenever the server (Firebase Cloud Messaging) dropped queued notifications.
 * @platform android
 */
export function addNotificationsDroppedListener(
  listener: () => void,
): EventSubscription {
  return emitter.addListener<void>(DROPPED_EVENT, listener);
}

/** Fires whenever the user interacts with a notification (e.g. taps it). */
export function addNotificationResponseReceivedListener(
  listener: (event: INotificationResponse) => void,
): EventSubscription {
  return emitter.addListener<INotificationResponse>(
    RESPONSE_RECEIVED_EVENT,
    response => {
      dlog(
        () =>
          `[notifications] response ${response.actionIdentifier} for ${response.notification.request.identifier}`,
      );
      listener(mapNotificationResponse(response));
    },
  );
}

/**
 * The most recently received notification response, or `null` if the app was not opened by
 * one.
 */
export function getLastNotificationResponse(): INotificationResponse | null {
  if (!notificationsEmitterModule.getLastNotificationResponse) {
    throw new UnavailabilityError(
      'Notifications',
      'getLastNotificationResponse',
    );
  }
  const response = notificationsEmitterModule.getLastNotificationResponse();
  return response ? mapNotificationResponse(response) : response;
}

/**
 * Clears the last notification response, e.g. once its route has been handled and should not
 * be re-applied on the next read.
 */
export function clearLastNotificationResponse(): void {
  if (!notificationsEmitterModule.clearLastNotificationResponse) {
    throw new UnavailabilityError(
      'Notifications',
      'clearLastNotificationResponse',
    );
  }
  notificationsEmitterModule.clearLastNotificationResponse();
  emitter.emit(RESPONSE_CLEARED_EVENT, []);
}

/** Fires whenever `clearLastNotificationResponse` runs. */
export function addNotificationResponseClearedListener(
  listener: () => void,
): EventSubscription {
  return emitter.addListener<void>(RESPONSE_CLEARED_EVENT, listener);
}
