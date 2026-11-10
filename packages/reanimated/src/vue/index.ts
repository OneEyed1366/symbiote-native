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
// Upstream's spellings of the prop types, which carry no `I` there
export type { IAnimatedScrollViewProps as AnimatedScrollViewProps } from './animated-scroll-view';
export type { IAnimatedFlatListProps as FlatListPropsWithLayout } from './animated-flat-list';
export { LayoutAnimationConfig } from './layout-animation-config';
export type { ILayoutAnimationConfigProps } from './layout-animation-config';
export { SharedTransitionBoundary } from './shared-transition-boundary';
export type {
  ISharedTransitionBoundaryProps,
  ISharedTransitionBoundaryProps as SharedTransitionBoundaryProps,
} from './shared-transition-boundary';
export { PerformanceMonitor } from './performance-monitor';
export type {
  IPerformanceMonitorProps,
  IPerformanceMonitorProps as PerformanceMonitorProps,
} from './performance-monitor';
export { ReducedMotionConfig } from './reduced-motion-config';

// The composables are ours: they bind to the engine instead of to a component wrapper
export { useAnimatedKeyboard } from './composables/use-animated-keyboard';
export { useAnimatedProps } from './composables/use-animated-props';
export { useAnimatedReaction } from './composables/use-animated-reaction';
export { useAnimatedRef } from './composables/use-animated-ref';
export { useAnimatedScrollHandler } from './composables/use-animated-scroll-handler';
export { useAnimatedSensor } from './composables/use-animated-sensor';
export { useAnimatedStyle } from './composables/use-animated-style';
export { useComposedEventHandler } from './composables/use-composed-event-handler';
export { useDerivedValue } from './composables/use-derived-value';
export { useEvent } from './composables/use-event';
export { useFrameCallback } from './composables/use-frame-callback';
export { useHandler } from './composables/use-handler';
export { useReducedMotion } from './composables/use-reduced-motion';
export {
  useScrollOffset,
  /** @deprecated Please use `useScrollOffset` instead. */
  useScrollOffset as useScrollViewOffset,
} from './composables/use-scroll-offset';
export { useSharedValue } from './composables/use-shared-value';
export { useTimestamp } from './composables/use-timestamp';
