// Отдельно от `tokens.ts`, чтобы `auto-registration.ts` не зависел от него по кругу
import {
  Platform,
  UnavailabilityError,
  type EventSubscription,
} from 'expo-modules-core';

import { dlog } from '@symbiote-native/engine';

import { pushTokenManager } from './native-modules';
import type { IDevicePushToken } from './types';

// Пакет только под iOS/Android, поэтому `Platform.OS` сужаем один раз здесь, а не кастами
function nativePlatform(): 'ios' | 'android' {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return Platform.OS;
  }
  throw new Error(`[notifications] unsupported platform: ${Platform.OS}`);
}

export type IPushTokenListener = (token: IDevicePushToken) => void;

/** Fires whenever the OS rolls the device push token while the app is running */
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

/** Returns the native FCM (Android) or APNs (iOS) device push token */
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
