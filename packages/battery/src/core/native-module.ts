import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import type { BatteryLevelEvent, BatteryState, BatteryStateEvent, PowerModeEvent } from './types';

const EXPO_BATTERY_MODULE_NAME = 'ExpoBattery';

// Upstream's own event names, verified against .vendors/expo/packages/expo-battery/src/Battery.ts
// (sdk-57) — a single native module fans out three distinct event shapes through one
// `addListener`, so the overloads below key the payload type off the literal event name, the
// same trick TypeScript uses for DOM's `addEventListener`.
export type INativeBatteryModule = {
  isSupported?: boolean;
  getBatteryLevelAsync?(): Promise<number>;
  getBatteryStateAsync?(): Promise<BatteryState>;
  isLowPowerModeEnabledAsync?(): Promise<boolean>;
  isBatteryOptimizationEnabledAsync?(): Promise<boolean>;
  addListener(
    eventName: 'Expo.batteryLevelDidChange',
    listener: (event: BatteryLevelEvent) => void,
  ): EventSubscription;
  addListener(
    eventName: 'Expo.batteryStateDidChange',
    listener: (event: BatteryStateEvent) => void,
  ): EventSubscription;
  addListener(
    eventName: 'Expo.powerModeDidChange',
    listener: (event: PowerModeEvent) => void,
  ): EventSubscription;
};

export const expoBattery = requireNativeModule<INativeBatteryModule>(EXPO_BATTERY_MODULE_NAME);
