// Hand-ported from .vendors/expo/packages/expo-battery/src/Battery.ts (sdk-57). Unlike
// local-auth/pedometer, upstream Battery never throws UnavailabilityError — every function
// falls back to a documented sentinel (-1 / BatteryState.UNKNOWN / false) when the native
// method is absent, so that fallback shape is preserved here verbatim rather than guessed.
import type { EventSubscription } from 'expo-modules-core';
import { expoBattery } from './native-module';
import {
  BatteryState,
  type BatteryLevelEvent,
  type BatteryStateEvent,
  type PowerModeEvent,
  type PowerState,
} from './types';

/**
 * Resolves with whether the battery API is available on the current device. `true` on Android
 * and physical iOS devices, `false` on iOS simulators.
 */
export async function isAvailableAsync(): Promise<boolean> {
  return Promise.resolve((expoBattery && expoBattery.isSupported) || false);
}

/**
 * Gets the battery level of the device as a number between `0` and `1`, inclusive. If the
 * device does not support retrieving the battery level, this method returns `-1`.
 */
export async function getBatteryLevelAsync(): Promise<number> {
  if (!expoBattery.getBatteryLevelAsync) {
    return -1;
  }
  return expoBattery.getBatteryLevelAsync();
}

/** Tells the battery's current state. */
export async function getBatteryStateAsync(): Promise<BatteryState> {
  if (!expoBattery.getBatteryStateAsync) {
    return BatteryState.UNKNOWN;
  }
  return expoBattery.getBatteryStateAsync();
}

/**
 * Gets the current status of Power Saver mode on Android and Low Power mode on iOS. If a
 * platform doesn't support low-power-mode reporting, this always resolves `false`, even if the
 * device is actually in low-power mode.
 */
export async function isLowPowerModeEnabledAsync(): Promise<boolean> {
  if (!expoBattery.isLowPowerModeEnabledAsync) {
    return false;
  }
  return expoBattery.isLowPowerModeEnabledAsync();
}

/**
 * Checks whether battery optimization is enabled for this app. If enabled, background tasks
 * might be affected when the app goes into doze mode state.
 * @platform android
 */
export async function isBatteryOptimizationEnabledAsync(): Promise<boolean> {
  if (!expoBattery.isBatteryOptimizationEnabledAsync) {
    return false;
  }
  return expoBattery.isBatteryOptimizationEnabledAsync();
}

/**
 * Gets the power state of the device: battery level, whether it is plugged in, and whether the
 * system is currently in Power Saver Mode (Android) / Low Power Mode (iOS).
 */
export async function getPowerStateAsync(): Promise<PowerState> {
  const [batteryLevel, batteryState, lowPowerMode] = await Promise.all([
    getBatteryLevelAsync(),
    getBatteryStateAsync(),
    isLowPowerModeEnabledAsync(),
  ]);
  return { batteryLevel, batteryState, lowPowerMode };
}

/**
 * Subscribe to battery level change updates. On Android this only fires on significant changes
 * (crossing the low/okay battery thresholds); on iOS it fires per one-percent drop, at most once
 * a minute.
 */
export function addBatteryLevelListener(
  listener: (event: BatteryLevelEvent) => void,
): EventSubscription {
  return expoBattery.addListener('Expo.batteryLevelDidChange', listener);
}

/** Subscribe to battery state (charging/full/unplugged/unknown) change updates. */
export function addBatteryStateListener(
  listener: (event: BatteryStateEvent) => void,
): EventSubscription {
  return expoBattery.addListener('Expo.batteryStateDidChange', listener);
}

/**
 * Subscribe to Power Saver Mode (Android) / Low Power Mode (iOS) updates. Fires whenever the
 * power mode is toggled.
 */
export function addLowPowerModeListener(
  listener: (event: PowerModeEvent) => void,
): EventSubscription {
  return expoBattery.addListener('Expo.powerModeDidChange', listener);
}
