// @symbiote-native/battery/svelte: the Svelte entry over the framework-agnostic core. Battery's
// three subscription-backed values (level/state/low-power-mode) each get their own lifecycle
// rune, matching upstream's own useBatteryLevel/useBatteryState/useLowPowerMode being three
// separate hooks, not one combined hook — mirrors the lifecycle-bucket naming convention of
// adapters/svelte/src/runes (never `hooks/`/`composables/`, those are React's and Vue's terms).

export { useBatteryLevel } from './runes/use-battery-level.svelte';
export { useBatteryState } from './runes/use-battery-state.svelte';
export { useLowPowerMode } from './runes/use-low-power-mode.svelte';
export * from '../core';
