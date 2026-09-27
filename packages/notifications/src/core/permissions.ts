// Ported from expo-notifications @ sdk-57's NotificationPermissions.ts.
import { Platform, UnavailabilityError } from 'expo-modules-core';

import { dlog } from '@symbiote-native/engine';

import { notificationPermissionsModule } from './native-modules';
import type {
  INotificationPermissionsRequest,
  INotificationPermissionsStatus,
} from './types';

/** Checks (without prompting) whether the app can currently display alerts, play sounds, etc. */
export async function getPermissionsAsync(): Promise<INotificationPermissionsStatus> {
  if (!notificationPermissionsModule.getPermissionsAsync) {
    throw new UnavailabilityError('Notifications', 'getPermissionsAsync');
  }
  const result = await notificationPermissionsModule.getPermissionsAsync();
  dlog(() => `[notifications] getPermissionsAsync -> ${result.status}`);
  return result;
}

/**
 * Prompts the user for notification permissions. Defaults to alerts + badge + sound on iOS —
 * on Android every permission is already granted and there is nothing to prompt for.
 */
export async function requestPermissionsAsync(
  permissions?: INotificationPermissionsRequest,
): Promise<INotificationPermissionsStatus> {
  if (!notificationPermissionsModule.requestPermissionsAsync) {
    throw new UnavailabilityError('Notifications', 'requestPermissionsAsync');
  }

  const requested: INotificationPermissionsRequest = permissions ?? {
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  };
  const platformRequest =
    requested[Platform.OS as keyof INotificationPermissionsRequest];

  dlog('[notifications] requestPermissionsAsync');
  const result =
    await notificationPermissionsModule.requestPermissionsAsync(
      platformRequest,
    );
  dlog(() => `[notifications] requestPermissionsAsync -> ${result.status}`);
  return result;
}
