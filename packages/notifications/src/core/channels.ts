// Ported from expo-notifications @ sdk-57's get/set/deleteNotificationChannel(Group)Async.ts —
// upstream splits each of these into a `.ts` (iOS no-op) and a `.android.ts` (real) file picked
// by Metro's platform extension resolution; this port collapses each pair into one function with
// a runtime `Platform.OS === 'android'` branch, since this package has no separate build step
// per platform to exploit the file-split for.
import { Platform, UnavailabilityError } from 'expo-modules-core';

import {
  notificationChannelGroupManager,
  notificationChannelManager,
} from './native-modules';
import {
  AndroidImportance,
  type INotificationChannel,
  type INotificationChannelGroup,
  type INotificationChannelGroupInput,
  type INotificationChannelInput,
} from './types';

const ANDROID_ONLY_NOTICE =
  'Notification channels are only supported on Android.';

function isAndroid(): boolean {
  return Platform.OS === 'android';
}

/** @platform android — empty array on every other platform. */
export async function getNotificationChannelsAsync(): Promise<
  INotificationChannel[]
> {
  if (!isAndroid()) {
    console.debug(ANDROID_ONLY_NOTICE);
    return [];
  }
  if (!notificationChannelManager.getNotificationChannelsAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'getNotificationChannelsAsync',
    );
  }
  return (
    (await notificationChannelManager.getNotificationChannelsAsync()) ?? []
  );
}

/** @platform android — `null` on every other platform. */
export async function getNotificationChannelAsync(
  channelId: string,
): Promise<INotificationChannel | null> {
  if (!isAndroid()) {
    console.debug(ANDROID_ONLY_NOTICE);
    return null;
  }
  if (!notificationChannelManager.getNotificationChannelAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'getNotificationChannelAsync',
    );
  }
  return notificationChannelManager.getNotificationChannelAsync(channelId);
}

/**
 * Creates or updates a channel. Only the name and description may change once a channel
 * exists — an Android OS limitation. @platform android — `null` on every other platform.
 */
export async function setNotificationChannelAsync(
  channelId: string,
  channel: INotificationChannelInput,
): Promise<INotificationChannel | null> {
  if (!isAndroid()) {
    console.debug(ANDROID_ONLY_NOTICE);
    return null;
  }
  if (!notificationChannelManager.setNotificationChannelAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'setNotificationChannelAsync',
    );
  }
  if (channel.importance === AndroidImportance.UNSPECIFIED) {
    console.warn(
      `[notifications] Channel "${channelId}" importance is UNSPECIFIED, which can error on some Android versions — use AndroidImportance.DEFAULT instead.`,
    );
  }
  return notificationChannelManager.setNotificationChannelAsync(
    channelId,
    channel,
  );
}

/** @platform android — no-op on every other platform. */
export async function deleteNotificationChannelAsync(
  channelId: string,
): Promise<void> {
  if (!isAndroid()) {
    console.debug(ANDROID_ONLY_NOTICE);
    return;
  }
  if (!notificationChannelManager.deleteNotificationChannelAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'deleteNotificationChannelAsync',
    );
  }
  return notificationChannelManager.deleteNotificationChannelAsync(channelId);
}

/** @platform android — empty array on every other platform. */
export async function getNotificationChannelGroupsAsync(): Promise<
  INotificationChannelGroup[]
> {
  if (!isAndroid()) {
    console.debug(ANDROID_ONLY_NOTICE);
    return [];
  }
  if (!notificationChannelGroupManager.getNotificationChannelGroupsAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'getNotificationChannelGroupsAsync',
    );
  }
  return notificationChannelGroupManager.getNotificationChannelGroupsAsync();
}

/** @platform android — `null` on every other platform. */
export async function getNotificationChannelGroupAsync(
  groupId: string,
): Promise<INotificationChannelGroup | null> {
  if (!isAndroid()) {
    console.debug(ANDROID_ONLY_NOTICE);
    return null;
  }
  if (!notificationChannelGroupManager.getNotificationChannelGroupAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'getNotificationChannelGroupAsync',
    );
  }
  return notificationChannelGroupManager.getNotificationChannelGroupAsync(
    groupId,
  );
}

/** @platform android — `null` on every other platform. */
export async function setNotificationChannelGroupAsync(
  groupId: string,
  group: INotificationChannelGroupInput,
): Promise<INotificationChannelGroup | null> {
  if (!isAndroid()) {
    console.debug(ANDROID_ONLY_NOTICE);
    return null;
  }
  if (!notificationChannelGroupManager.setNotificationChannelGroupAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'setNotificationChannelGroupAsync',
    );
  }
  return notificationChannelGroupManager.setNotificationChannelGroupAsync(
    groupId,
    group,
  );
}

/** @platform android — no-op on every other platform. */
export async function deleteNotificationChannelGroupAsync(
  groupId: string,
): Promise<void> {
  if (!isAndroid()) {
    console.debug(ANDROID_ONLY_NOTICE);
    return;
  }
  if (!notificationChannelGroupManager.deleteNotificationChannelGroupAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'deleteNotificationChannelGroupAsync',
    );
  }
  return notificationChannelGroupManager.deleteNotificationChannelGroupAsync(
    groupId,
  );
}
