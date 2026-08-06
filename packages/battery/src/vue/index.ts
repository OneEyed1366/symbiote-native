// @symbiote-native/battery/vue: the Vue entry over the framework-agnostic core. Battery's three
// subscription-backed values (level/state/low-power-mode) each get their own lifecycle
// composable, matching upstream's own useBatteryLevel/useBatteryState/useLowPowerMode being
// three separate hooks, not one combined hook — mirrors the lifecycle-bucket naming convention
// of adapters/vue/src/composables (never `hooks/`, that's React's term).

export { useBatteryLevel } from './composables/use-battery-level';
export { useBatteryState } from './composables/use-battery-state';
export { useLowPowerMode } from './composables/use-low-power-mode';
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
