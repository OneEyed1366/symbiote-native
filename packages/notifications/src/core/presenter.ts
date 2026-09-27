// Ported from expo-notifications @ sdk-57's getPresentedNotificationsAsync.ts,
// dismissNotificationAsync.ts, dismissAllNotificationsAsync.ts.
import { UnavailabilityError } from 'expo-modules-core';

import { notificationPresenterModule } from './native-modules';
import type { INotification } from './types';
import { mapNotification } from './utils';

/** Notifications currently in the tray (Notification Center). Empty on Android below API 23. */
export async function getPresentedNotificationsAsync(): Promise<
  INotification[]
> {
  if (!notificationPresenterModule.getPresentedNotificationsAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'getPresentedNotificationsAsync',
    );
  }
  const notifications =
    await notificationPresenterModule.getPresentedNotificationsAsync();
  return notifications.map(mapNotification);
}

/** Removes one notification from the tray by its identifier. */
export async function dismissNotificationAsync(
  notificationIdentifier: string,
): Promise<void> {
  if (!notificationPresenterModule.dismissNotificationAsync) {
    throw new UnavailabilityError('Notifications', 'dismissNotificationAsync');
  }
  return notificationPresenterModule.dismissNotificationAsync(
    notificationIdentifier,
  );
}

/** Removes every one of this app's notifications from the tray. */
export async function dismissAllNotificationsAsync(): Promise<void> {
  if (!notificationPresenterModule.dismissAllNotificationsAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'dismissAllNotificationsAsync',
    );
  }
  return notificationPresenterModule.dismissAllNotificationsAsync();
}
