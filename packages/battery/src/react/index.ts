// @symbiote-native/battery/react: the React entry over the framework-agnostic core. Battery's
// three subscription-backed values (level/state/low-power-mode) each get their own lifecycle
// hook, matching upstream's own useBatteryLevel/useBatteryState/useLowPowerMode being three
// separate hooks, not one combined hook — mirrors the lifecycle-bucket naming convention of
// adapters/react/src/hooks (never `composables`, that's Vue's term).

export { useBatteryLevel } from './hooks/use-battery-level';
export { useBatteryState } from './hooks/use-battery-state';
export { useLowPowerMode } from './hooks/use-low-power-mode';
export {
  isAvailableAsync,
  getBatteryLevelAsync,
  getBatteryStateAsync,
  isLowPowerModeEnabledAsync,
  isBatteryOptimizationEnabledAsync,
  getPowerStateAsync,
  addBatteryLevelListener,
  addBatteryStateListener,
  addLowPowerModeListener,
  BatteryState,
  type PowerState,
  type BatteryLevelEvent,
  type BatteryStateEvent,
  type PowerModeEvent,
  type EventSubscription,
} from '../core';
