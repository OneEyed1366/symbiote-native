// The Animated namespace for @symbiote-native/svelte: the Svelte twin of
// adapters/vue/src/modules/animated/index.ts (the primary reference — Svelte 5's runes are much
// closer to Vue's reactivity model than to React's hooks). The value graph, easing,
// interpolation and drivers come from @symbiote-native/engine (framework-agnostic, JS-driven),
// spread in verbatim.
//
// Unlike Vue/React, there is NO generic `createAnimatedComponent(Component)` here. Vue wraps an
// arbitrary base component via `h(Component, reducedProps)`; React via `createElement(Component,
// childProps)` — both are ordinary runtime function calls that work on any component reference.
// Svelte has no equivalent: a compiled Svelte component is not a plain function you can invoke
// generically with a fresh prop bag and get back something you can further compose — wrapping
// one means literally writing `<Component {...props} bind:this={ref}>` inside another `.svelte`
// file. So each of the four components below (View/Text/Image/ScrollView) is its own hand-
// authored `.svelte` file sharing only the non-visual reconcile logic
// (animated-props-runtime.ts). `Animated.createAnimatedComponent` is a genuine, documented scope
// boundary, not an oversight — see this module's own report for the full reasoning. A consumer
// wanting to animate their OWN custom component should follow the same four-file pattern (rebuild
// an AnimatedProps leaf from its props, reconcile on every render into the component's own host
// node/handle, expose that host node via bind:this) rather than reach for a generic wrapper that
// does not exist on this adapter.
//
// Animated.FlatList / Animated.SectionList are also NOT implemented in this pass. Vue omits them
// because it has no FlatList/SectionList base component at all; Svelte DOES have both, so this is
// a narrower, more honest gap than Vue's — flagged as follow-up work, not silently dropped (see
// the module's own report). Wrapping them would follow the exact same
// wrap-the-real-component-via-its-exported-handle shape as AnimatedScrollView, once each exposes
// (or is confirmed to need) an equivalent handle.

import {
  AnimatedValue,
  AnimatedValueXY,
  AnimatedColor,
  AnimatedMock,
  Easing,
  Platform,
  timing,
  spring,
  decay,
  parallel,
  sequence,
  stagger,
  loop,
  delay,
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
  event,
  forkEvent,
  unforkEvent,
} from '@symbiote-native/engine';
import AnimatedViewComponent from './AnimatedView.svelte';
import AnimatedTextComponent from './AnimatedText.svelte';
import AnimatedImageComponent from './AnimatedImage.svelte';
import AnimatedScrollViewComponent from './AnimatedScrollView.svelte';

export type { IAnimatedComponentProps } from './animated-component-props';
export { createAnimatedReconcileRuntime } from './animated-props-runtime';
export type { IAnimatedReconcileRuntime } from './animated-props-runtime';

// The live, JS-driven driver namespace (real frames). RN's AnimatedImplementation.
const liveDrivers = {
  Value: AnimatedValue,
  ValueXY: AnimatedValueXY,
  Color: AnimatedColor,
  Easing,
  timing,
  spring,
  decay,
  parallel,
  sequence,
  stagger,
  loop,
  delay,
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
  event,
  forkEvent,
  unforkEvent,
};

// RN swaps the WHOLE driver namespace for the mock when the host reports isDisableAnimations
// (reduced motion / test env): the mock keeps the same surface but jumps each animation to its
// final value synchronously, no frames. The animated COMPONENTS (View/Text/Image/ScrollView) are
// live in both branches; only the drivers/value/operators/events half is swapped, exactly like
// RN spreading `...Animated` (impl or mock) over the same component references.
const drivers = Platform.isDisableAnimations ? AnimatedMock : liveDrivers;

export const Animated = {
  View: AnimatedViewComponent,
  Text: AnimatedTextComponent,
  Image: AnimatedImageComponent,
  ScrollView: AnimatedScrollViewComponent,
  ...drivers,
};
