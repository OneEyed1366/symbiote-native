// @symbiote-native/battery/solid: the Solid entry over the framework-agnostic core. Battery's
// three subscription-backed values (level/state/low-power-mode) each get their own primitive,
// matching upstream's own useBatteryLevel/useBatteryState/useLowPowerMode being three separate
// hooks, not one combined hook — mirrors the lifecycle-bucket naming of
// adapters/solid/src/primitives (never `hooks/`/`composables/`/`runes/`, and `create*` rather
// than `use*`, which Solid reserves for consuming something that already exists).

export { createBatteryLevel } from './primitives/create-battery-level';
export { createBatteryState } from './primitives/create-battery-state';
export { createLowPowerMode } from './primitives/create-low-power-mode';
export * from '../core';
