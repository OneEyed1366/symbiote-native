import { Platform, UnavailabilityError } from 'expo-modules-core';

import { expoHaptics } from './native-module';
import {
  AndroidHaptics,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
} from './types';

const NATIVE_MODULE_NAME = 'expo-haptics';

/**
 * The kind of notification response used in the feedback. On Android it is simulated using
 * `Vibrator`; on iOS it maps directly to `UINotificationFeedbackType`.
 */
export async function notificationAsync(
  type: NotificationFeedbackType = NotificationFeedbackType.Success,
): Promise<void> {
  if (!expoHaptics.notificationAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'notificationAsync');
  }
  await expoHaptics.notificationAsync(type);
}

/**
 * A collision indicator. On Android it is simulated using `Vibrator`; on iOS it maps directly to
 * `UIImpactFeedbackStyle`.
 * @see Android's `Vibrator` API is not recommended for haptics feedback — prefer
 * `performAndroidHapticsAsync`, which drives the device haptics engine directly and does not
 * require the `VIBRATE` permission.
 */
export async function impactAsync(
  style: ImpactFeedbackStyle = ImpactFeedbackStyle.Medium,
): Promise<void> {
  if (!expoHaptics.impactAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'impactAsync');
  }
  await expoHaptics.impactAsync(style);
}

/**
 * Lets the user know a selection change has been registered.
 */
export async function selectionAsync(): Promise<void> {
  if (!expoHaptics.selectionAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'selectionAsync');
  }
  await expoHaptics.selectionAsync();
}

/**
 * Uses the device haptics engine directly to provide physical feedback to the user. A no-op on
 * every platform except Android.
 * @platform android
 */
export async function performAndroidHapticsAsync(
  type: AndroidHaptics,
): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  if (!expoHaptics.performHapticsAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'performHapticsAsync');
  }
  await expoHaptics.performHapticsAsync(type);
}
