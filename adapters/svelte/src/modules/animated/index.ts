// The Animated namespace for @symbiote-native/svelte: the Svelte twin of
// adapters/vue/src/modules/animated/index.ts (the primary reference — Svelte 5's runes are much
// closer to Vue's reactivity model than to React's hooks). The value graph, easing,
// interpolation and drivers come from @symbiote-native/engine (framework-agnostic, JS-driven),
// spread in verbatim.
//
// All six components come from ONE generic `createAnimatedComponent(Base)` — the same shape
// React, Vue and Solid have — applied to the ordinary components. There is no hand-authored
// `.svelte` file per animated component any more: an earlier revision of this header claimed a
// generic wrap was impossible on Svelte, and that was simply wrong. See
// create-animated-component.ts for how the wrap reaches the host node behind a base that exports
// an imperative handle (ScrollView/FlatList/SectionList) versus one that exports nothing
// (View/Text/Image), and for why it is plain TS rather than a parametrized `.svelte` file.
//
// A consumer animating their OWN component wraps it the same way: `createAnimatedComponent(Mine)`
// works as long as Mine either exports `getScrollNode()` or forwards `{@attach}` onto its host
// tag, which every component in this adapter does.

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
import View from '../../components/View.svelte';
import Text from '../../components/Text.svelte';
import Image from '../../components/image/index.svelte';
import ScrollView from '../../components/scroll-view/index.svelte';
import FlatList from '../../components/flat-list/index.svelte';
import SectionList from '../../components/section-list/index.svelte';
import { createAnimatedComponent } from './create-animated-component';

export { createAnimatedComponent } from './create-animated-component';
export type { IAnimatedComponentProps } from './animated-component-props';

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
// final value synchronously, no frames. The animated COMPONENTS (View/Text/Image/ScrollView/
// FlatList/SectionList) are live in both branches; only the drivers/value/operators/events half
// is swapped, exactly like
// RN spreading `...Animated` (impl or mock) over the same component references.
const drivers = Platform.isDisableAnimations ? AnimatedMock : liveDrivers;

// Wrapped eagerly, unlike Vue's lazy getters: nothing in the scroll/list chain imports THIS
// module back (sticky-header builds its own Animated.View straight from the wrap), so there is
// no half-evaluated cycle to dodge.
export const Animated = {
  View: createAnimatedComponent(View),
  Text: createAnimatedComponent(Text),
  Image: createAnimatedComponent(Image),
  ScrollView: createAnimatedComponent(ScrollView),
  FlatList: createAnimatedComponent(FlatList),
  SectionList: createAnimatedComponent(SectionList),
  ...drivers,
};
