// RN's `useAnimatedValue`, `useAnimatedValueXY` and `useAnimatedColor`: a component's script runs
// once, so the engine's factories already are the once-per-component call

export {
  createAnimatedColor as useAnimatedColor,
  createAnimatedValue as useAnimatedValue,
  createAnimatedValueXY as useAnimatedValueXY,
} from '@symbiote-native/engine';
