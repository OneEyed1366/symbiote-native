// Everything with no component, ref or renderer in it, and the claims the engine takes it through
export * from '../core';

// Animated.View and the rest are the host tags, which take an animated style as they are
// `TextInput` goes beyond upstream: the adapter's text input is a tag, so there is no component
// to wrap with `createAnimatedComponent`
export { default, TextInput } from './animated';
export {
  createAnimatedComponent,
  createCSSAnimatedComponent,
} from '../core/animated-component';
export type { IAnimatedHostProps } from './animated-host-props';
// Upstream's spellings of the prop types, which carry no `I` there
export type { IAnimatedScrollViewProps as AnimatedScrollViewProps } from './animated-scroll-view';
export type { IAnimatedFlatListProps as FlatListPropsWithLayout } from './animated-flat-list';
export { AnimatedFlatList } from './animated-flat-list';
export { AnimatedScrollView } from './animated-scroll-view';
export { LayoutAnimationConfig } from './layout-animation-config';
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

import { hooks } from './services/hooks';

// The functions are ours: they bind to the engine instead of to a component wrapper, and they
// run in an injection context, a constructor or a field initializer of a component or a service
export const {
  useAnimatedKeyboard,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedSensor,
  useAnimatedStyle,
  useComposedEventHandler,
  useDerivedValue,
  useEvent,
  useFrameCallback,
  useHandler,
  useReducedMotion,
  useScrollOffset,
  useSharedValue,
  useTimestamp,
} = hooks;

/** @deprecated Please use `useScrollOffset` instead. */
export const useScrollViewOffset = hooks.useScrollOffset;
