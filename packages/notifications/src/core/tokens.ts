// Порт токенов из upstream sdk-57, фоновый ресинк токена живёт в `auto-registration.ts`
import { applicationId } from '@symbiote-native/application';
import { CodedError, UnavailabilityError } from 'expo-modules-core';

import { dlog } from '@symbiote-native/engine';

import { installPushTokenAutoRegistration } from './auto-registration';
import { getDevicePushTokenAsync } from './device-token';
import {
  pushTokenManager,
  serverRegistrationModule,
  topicSubscriptionModule,
} from './native-modules';
import { abortPendingRegistration } from './registration-abort';
import {
  getDeviceIdAsync,
  getTypeOfToken,
  shouldUseDevelopmentNotificationService,
} from './token-metadata';
import type {
  IDevicePushToken,
  IExpoPushToken,
  IExpoPushTokenOptions,
} from './types';

export {
  addPushTokenListener,
  getDevicePushTokenAsync,
  type IPushTokenListener,
} from './device-token';

const PRODUCTION_BASE_URL = 'https://exp.host/--/api/v2/';

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

/** Persists whether the device push token keeps being pushed to the Expo push service */
export async function setAutoServerRegistrationEnabledAsync(
  enabled: boolean,
): Promise<void> {
  // Перезаписываем регистрацию, поэтому висящий запрос не должен завершиться
  abortPendingRegistration();

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
  installPushTokenAutoRegistration();
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

async function requestExpoPushTokenAsync(
  url: string,
  body: Record<string, unknown>,
): Promise<string> {
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

  return extractExpoPushToken(await parseJsonResponse(response));
}

// Вынесено, чтобы `getExpoPushTokenAsync` читался как запрос токена и регистрация
async function buildExpoPushTokenBody(
  options: IExpoPushTokenOptions,
  devicePushToken: IDevicePushToken,
): Promise<Record<string, unknown>> {
  if (!options.projectId) {
    throw new CodedError(
      'ERR_NOTIFICATIONS_NO_EXPERIENCE_ID',
      'No "projectId" was passed to getExpoPushTokenAsync(). Pass it explicitly (this port has no expo-constants).',
    );
  }
  const appId = options.applicationId ?? applicationId;
  if (!appId) {
    throw new CodedError(
      'ERR_NOTIFICATIONS_NO_APPLICATION_ID',
      'No "applicationId" was passed to getExpoPushTokenAsync() and the app has none of its own.',
    );
  }

  const deviceId = options.deviceId ?? (await getDeviceIdAsync());
  return {
    type: options.type ?? getTypeOfToken(devicePushToken),
    deviceId: deviceId.toLowerCase(),
    development:
      options.development ?? (await shouldUseDevelopmentNotificationService()),
    appId,
    deviceToken: getDeviceToken(devicePushToken),
    projectId: options.projectId,
  };
}

/** Returns an Expo push token for Expo's push relay, needs network so retry when back online */
export async function getExpoPushTokenAsync(
  options: IExpoPushTokenOptions = {},
): Promise<IExpoPushToken> {
  const devicePushToken =
    options.devicePushToken ?? (await getDevicePushTokenAsync());
  const body = await buildExpoPushTokenBody(options, devicePushToken);
  const baseUrl = options.baseUrl ?? PRODUCTION_BASE_URL;
  const url = options.url ?? `${baseUrl}push/getExpoPushToken`;

  const expoPushToken = await requestExpoPushTokenAsync(url, body);

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
