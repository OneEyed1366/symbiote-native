// Ported from expo-notifications @ sdk-57's NotificationsHandler.ts.
import {
  CodedError,
  LegacyEventEmitter,
  type EventSubscription,
} from 'expo-modules-core';

import { dlog } from '@symbiote-native/engine';

import { notificationsHandlerModule } from './native-modules';
import type {
  INotification,
  INotificationBehavior,
  INotificationHandler,
} from './types';
import { mapNotification } from './utils';

export class NotificationTimeoutError extends CodedError {
  override info: { notification: INotification; id: string };
  constructor(notificationId: string, notification: INotification) {
    super(
      'ERR_NOTIFICATION_TIMEOUT',
      `Notification handling timed out for ID ${notificationId}.`,
    );
    this.info = { id: notificationId, notification };
  }
}

type IHandleNotificationEvent = { id: string; notification: INotification };

const emitter = new LegacyEventEmitter(notificationsHandlerModule);
const HANDLE_EVENT = 'onHandleNotification';
const HANDLE_TIMEOUT_EVENT = 'onHandleNotificationTimeout';

let handleSubscription: EventSubscription | null = null;
let handleTimeoutSubscription: EventSubscription | null = null;

/**
 * Sets the callback deciding whether/how a notification received while the app is running
 * should be shown. Must respond within 3 seconds or the notification is discarded. Passing
 * `null` clears the handler — the default (no handler) is to not show anything.
 */
export function setNotificationHandler(
  handler: INotificationHandler | null,
): void {
  handleSubscription?.remove();
  handleSubscription = null;
  handleTimeoutSubscription?.remove();
  handleTimeoutSubscription = null;

  if (!handler) return;

  dlog('[notifications] setNotificationHandler');

  handleSubscription = emitter.addListener<IHandleNotificationEvent>(
    HANDLE_EVENT,
    async ({ id, notification }) => {
      if (!notificationsHandlerModule.handleNotificationAsync) {
        handler.handleError?.(
          id,
          new Error(
            'handleNotificationAsync is not available on this platform',
          ),
        );
        return;
      }
      try {
        const behavior: INotificationBehavior =
          await handler.handleNotification(mapNotification(notification));
        if (behavior.shouldShowAlert) {
          console.warn(
            '[notifications] `shouldShowAlert` is deprecated — specify `shouldShowBanner` and/or `shouldShowList` instead.',
          );
        }
        await notificationsHandlerModule.handleNotificationAsync(id, behavior);
        dlog(() => `[notifications] handled ${id}`);
        handler.handleSuccess?.(id);
      } catch (error) {
        handler.handleError?.(
          id,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );

  handleTimeoutSubscription = emitter.addListener<IHandleNotificationEvent>(
    HANDLE_TIMEOUT_EVENT,
    ({ id, notification }) =>
      handler.handleError?.(
        id,
        new NotificationTimeoutError(id, mapNotification(notification)),
      ),
  );
}
