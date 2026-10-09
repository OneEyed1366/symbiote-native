// Everything with no component, ref or renderer in it, and the claims the engine takes it through
export * from '../core';

// Animated.View and the rest are the host tags, which take an animated style as they are
// `TextInput` goes beyond upstream: the adapter's text input is a tag, so there is no component
// to wrap with `createAnimatedComponent`
export {
  default,
  createAnimatedComponent,
  createCSSAnimatedComponent,
  TextInput,
} from './animated';
export type { IAnimatedHostProps } from './animated';
export { LayoutAnimationConfig } from './layout-animation-config';
export { SharedTransitionBoundary } from './shared-transition-boundary';
export type { ISharedTransitionBoundaryProps } from './shared-transition-boundary';
export { PerformanceMonitor } from './performance-monitor';
export type { IPerformanceMonitorProps } from './performance-monitor';
// Only an effect over the reduced-motion manager, nothing in it touches a renderer
export { ReducedMotionConfig } from 'react-native-reanimated';
export type { ILayoutAnimationConfigProps } from './layout-animation-config';

// The hooks are ours: they bind to the engine instead of to a component wrapper
export { useAnimatedKeyboard } from './hooks/use-animated-keyboard';
export { useAnimatedProps } from './hooks/use-animated-props';
export { useAnimatedReaction } from './hooks/use-animated-reaction';
export { useAnimatedRef } from './hooks/use-animated-ref';
export { useAnimatedScrollHandler } from './hooks/use-animated-scroll-handler';
export { useAnimatedSensor } from './hooks/use-animated-sensor';
export { useAnimatedStyle } from './hooks/use-animated-style';
export { useComposedEventHandler } from './hooks/use-composed-event-handler';
export { useDerivedValue } from './hooks/use-derived-value';
export { useEvent } from './hooks/use-event';
export { useFrameCallback } from './hooks/use-frame-callback';
export { useHandler } from './hooks/use-handler';
export { useReducedMotion } from './hooks/use-reduced-motion';
export {
  useScrollOffset,
  /** @deprecated Please use `useScrollOffset` instead. */
  useScrollOffset as useScrollViewOffset,
} from './hooks/use-scroll-offset';
export { useSharedValue } from './hooks/use-shared-value';
export { useTimestamp } from './hooks/use-timestamp';
