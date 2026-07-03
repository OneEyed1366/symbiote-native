// Dimensions moved to @symbiote-native/engine (a framework-agnostic device-state module re-exported
// by every adapter). This thin re-export keeps @symbiote-native/react's public surface identical.
export { Dimensions } from '@symbiote-native/engine';
export type {
  IDisplayMetrics,
  IDisplayMetricsAndroid,
  IDimensionsPayload,
  IDimensionsSet,
  IDimensionsKey,
  IDimensionsChangeListener,
  IDimensionsStatic,
} from '@symbiote-native/engine';
