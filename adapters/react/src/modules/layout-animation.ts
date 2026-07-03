// LayoutAnimation moved to @symbiote-native/engine (a framework-agnostic native-bridge consumer
// re-exported by every adapter). This thin re-export keeps @symbiote-native/react's surface identical.
export { LayoutAnimation } from '@symbiote-native/engine';
export type {
  ILayoutAnimationType,
  ILayoutAnimationProperty,
  ILayoutAnimationConfig,
  ILayoutAnimationAnim,
  ILayoutAnimationTypes,
  ILayoutAnimationProperties,
} from '@symbiote-native/engine';
