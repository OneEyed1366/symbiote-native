// Ported from expo-notifications @ sdk-57's getDevicePushTokenAsync.ts, getExpoPushTokenAsync.ts,
// unregisterForNotificationsAsync.ts, topicSubscription.ts, TokenEmitter.ts, and the
// `setAutoServerRegistrationEnabledAsync` half of DevicePushTokenAutoRegistration.fx.ts.
//
// ponytail: upstream's DevicePushTokenAutoRegistration.fx.ts also wires a permanent, module-load
// background daemon that re-POSTs the device token to Expo's push backend on every token change
// (with exponential backoff, via `abort-controller`) whenever registration was left enabled.
// That auto-resync daemon is NOT ported — an app that wants it can call
// `getExpoPushTokenAsync()` again from its own `addPushTokenListener` callback, which is the
// same effect without a permanent background retry loop and its extra dependency.
import {
  CodedError,
  Platform,
  UnavailabilityError,
  type EventSubscription,
} from 'expo-modules-core';

import { dlog } from '@symbiote-native/engine';

import {
  pushTokenManager,
  serverRegistrationModule,
  topicSubscriptionModule,
} from './native-modules';
import type {
  IDevicePushToken,
  IExpoPushToken,
  IExpoPushTokenOptions,
} from './types';

const PRODUCTION_BASE_URL = 'https://exp.host/--/api/v2/';

// This package targets iOS/Android only (root CLAUDE.md); narrow `Platform.OS` at the one
// boundary that needs it rather than casting at every call site.
function nativePlatform(): 'ios' | 'android' {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return Platform.OS;
  }
  throw new Error(`[notifications] unsupported platform: ${Platform.OS}`);
}

export type IPushTokenListener = (token: IDevicePushToken) => void;

/** Fires whenever the OS rolls the device push token while the app is running. */
export function addPushTokenListener(
  listener: IPushTokenListener,
): EventSubscription {
  return pushTokenManager.addListener(
    'onDevicePushToken',
    ({ devicePushToken }) => {
      listener({ data: devicePushToken, type: nativePlatform() });
    },
  );
}

let nativeTokenPromise: Promise<string> | null = null;

/** Returns the native FCM (Android) or APNs (iOS) device push token. */
export async function getDevicePushTokenAsync(): Promise<IDevicePushToken> {
  if (!pushTokenManager.getDevicePushTokenAsync) {
    throw new UnavailabilityError('Notifications', 'getDevicePushTokenAsync');
  }

  let devicePushToken: string;
  if (nativeTokenPromise) {
    devicePushToken = await nativeTokenPromise;
  } else {
    nativeTokenPromise = pushTokenManager.getDevicePushTokenAsync();
    devicePushToken = await nativeTokenPromise;
    nativeTokenPromise = null;
  }

  dlog('[notifications] getDevicePushTokenAsync resolved');
  return { type: nativePlatform(), data: devicePushToken };
}

/** Unregisters the device from receiving remote push notifications entirely. */
export async function unregisterForNotificationsAsync(): Promise<void> {
  if (!pushTokenManager.unregisterForNotificationsAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'unregisterForNotificationsAsync',
    );
  }
  return pushTokenManager.unregisterForNotificationsAsync();
}

/** Subscribes the device to an FCM topic. @platform android */
export async function subscribeToTopicAsync(topic: string): Promise<null> {
  if (!topicSubscriptionModule.subscribeToTopicAsync) {
    throw new UnavailabilityError('Notifications', 'subscribeToTopicAsync');
  }
  return topicSubscriptionModule.subscribeToTopicAsync(topic);
}

/** Unsubscribes the device from an FCM topic. @platform android */
export async function unsubscribeFromTopicAsync(topic: string): Promise<null> {
  if (!topicSubscriptionModule.unsubscribeFromTopicAsync) {
    throw new UnavailabilityError('Notifications', 'unsubscribeFromTopicAsync');
  }
  return topicSubscriptionModule.unsubscribeFromTopicAsync(topic);
}

/**
 * Enables/disables letting the OS-level registration blob persist whether the device push
 * token should keep being pushed to the Expo push service backend. See the module doc comment
 * above for what this deliberately does *not* do (the auto-resync daemon).
 */
export async function setAutoServerRegistrationEnabledAsync(
  enabled: boolean,
): Promise<void> {
  if (!serverRegistrationModule.setRegistrationInfoAsync) {
    throw new UnavailabilityError('Notifications', 'setRegistrationInfoAsync');
  }

  if (!enabled) {
    await serverRegistrationModule.setRegistrationInfoAsync(null);
    return;
  }

  let existing: Record<string, unknown> = {};
  try {
    const info = await serverRegistrationModule.getRegistrationInfoAsync?.();
    if (info) {
      existing = JSON.parse(info);
    }
  } catch {
    // Corrupt/missing persisted blob — start fresh.
  }
  existing.isEnabled = true;
  await serverRegistrationModule.setRegistrationInfoAsync(
    JSON.stringify(existing),
  );
}

async function getDeviceIdAsync(): Promise<string> {
  try {
    if (!serverRegistrationModule.getInstallationIdAsync) {
      throw new UnavailabilityError('Notifications', 'getInstallationIdAsync');
    }
    return await serverRegistrationModule.getInstallationIdAsync();
  } catch (error) {
    throw new CodedError(
      'ERR_NOTIF_DEVICE_ID',
      `Could not fetch the installation ID of the application: ${error}.`,
    );
  }
}

function getTypeOfToken(devicePushToken: IDevicePushToken): string {
  switch (devicePushToken.type) {
    case 'ios':
      return 'apns';
    case 'android':
      return 'fcm';
  }
}

function getDeviceToken(devicePushToken: IDevicePushToken): string {
  return devicePushToken.data;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CodedError(
      'ERR_NOTIFICATIONS_SERVER_ERROR',
      'Expected a JSON response from server when fetching Expo token.',
    );
  }
}

function extractExpoPushToken(data: unknown): string {
  if (
    data !== null &&
    typeof data === 'object' &&
    'data' in data &&
    data.data !== null &&
    typeof data.data === 'object' &&
    'expoPushToken' in data.data &&
    typeof data.data.expoPushToken === 'string'
  ) {
    return data.data.expoPushToken;
  }
  throw new CodedError(
    'ERR_NOTIFICATIONS_SERVER_ERROR',
    `Malformed response from server, expected "{ data: { expoPushToken: string } }", received: ${JSON.stringify(data)}.`,
  );
}

/**
 * Returns an Expo push token usable with Expo's push notification relay service. Makes a
 * network request to Expo's servers — wrap in try/catch and retry once the device is back
 * online.
 *
 * ponytail: upstream auto-fills `projectId`/`applicationId`/`development` from
 * `expo-constants`/`expo-application`. Neither package is part of this port, so pass them
 * explicitly (`applicationId` from `@symbiote-native/application`'s own `applicationId` export
 * covers the second one).
 */
export async function getExpoPushTokenAsync(
  options: IExpoPushTokenOptions = {},
): Promise<IExpoPushToken> {
  const devicePushToken =
    options.devicePushToken ?? (await getDevicePushTokenAsync());
  const deviceId = options.deviceId ?? (await getDeviceIdAsync());

  if (!options.projectId) {
    throw new CodedError(
      'ERR_NOTIFICATIONS_NO_EXPERIENCE_ID',
      'No "projectId" was passed to getExpoPushTokenAsync(). This port does not read expo-constants — pass it explicitly.',
    );
  }
  if (!options.applicationId) {
    throw new CodedError(
      'ERR_NOTIFICATIONS_NO_APPLICATION_ID',
      'No "applicationId" was passed to getExpoPushTokenAsync(). This port does not read expo-application — pass it explicitly (e.g. @symbiote-native/application\'s `applicationId`).',
    );
  }

  const type = options.type ?? getTypeOfToken(devicePushToken);
  const development = options.development ?? false;
  const baseUrl = options.baseUrl ?? PRODUCTION_BASE_URL;
  const url = options.url ?? `${baseUrl}push/getExpoPushToken`;

  const body = {
    type,
    deviceId: deviceId.toLowerCase(),
    development,
    appId: options.applicationId,
    deviceToken: getDeviceToken(devicePushToken),
    projectId: options.projectId,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new CodedError(
      'ERR_NOTIFICATIONS_NETWORK_ERROR',
      `Error encountered while fetching Expo token: ${error}.`,
    );
  }

  if (!response.ok) {
    throw new CodedError(
      'ERR_NOTIFICATIONS_SERVER_ERROR',
      `Error encountered while fetching Expo token, expected an OK response, received: ${response.status}.`,
    );
  }

  const expoPushToken = extractExpoPushToken(await parseJsonResponse(response));

  if (!options.url && !options.baseUrl) {
    try {
      await setAutoServerRegistrationEnabledAsync(true);
    } catch (error) {
      console.warn(
        '[notifications] Could not enable auto server registration',
        error,
      );
    }
  }

  dlog('[notifications] getExpoPushTokenAsync resolved');
  return { type: 'expo', data: expoPushToken };
}
