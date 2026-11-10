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
export type { IAnimatedScrollViewProps as AnimatedScrollViewProps } from './animated-scroll-view-props';
export type { IAnimatedFlatListProps as FlatListPropsWithLayout } from './animated-flat-list-props';
export { default as LayoutAnimationConfig } from './layout-animation-config.svelte';
export type { ILayoutAnimationConfigProps } from './layout-animation-config.svelte';
export { default as SharedTransitionBoundary } from './shared-transition-boundary.svelte';
export type {
  ISharedTransitionBoundaryProps,
  ISharedTransitionBoundaryProps as SharedTransitionBoundaryProps,
} from './shared-transition-boundary.svelte';
export { default as PerformanceMonitor } from './performance-monitor.svelte';
export type {
  IPerformanceMonitorProps,
  IPerformanceMonitorProps as PerformanceMonitorProps,
} from './performance-monitor.svelte';
export { default as ReducedMotionConfig } from './reduced-motion-config.svelte';

import { hooks } from './runes/hooks';

// The runes are ours: they bind to the engine instead of to a component wrapper
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
