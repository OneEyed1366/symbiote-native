// BatteryLevelService/BatteryStateService/LowPowerModeService are the Angular-only lifecycle
// half; the free functions and event subscription plumbing all live in core, shared with
// React/Vue. Three separate services (not one combined service), matching upstream's own
// useBatteryLevel/useBatteryState/useLowPowerMode being three separate hooks.
export { BatteryLevelService } from './services/battery-level.service';
export { BatteryStateService } from './services/battery-state.service';
export { LowPowerModeService } from './services/low-power-mode.service';
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
