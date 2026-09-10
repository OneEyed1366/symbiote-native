// The Animated namespace for @symbiote-native/vue. createAnimatedComponent applied to the Vue
// primitives gives Animated.View/Text/Image; the value graph, easing and imperative drivers come
// from @symbiote-native/engine (framework-agnostic, JS-driven), spread in verbatim. Both halves
// meet here so `Animated.timing(new Animated.Value(0), ...).start()` works against the
// Vue-driven engine.

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
import { FlatList } from '../../components/flat-list';
import { SectionList } from '../../components/section-list';
import { createAnimatedComponent } from './create-animated-component';

export { createAnimatedComponent } from './create-animated-component';

// The TAGS, not components — there are no View/Text/Image components left to alias, and a string
// base is what `createAnimatedComponent` already handles (`animated-tag-base.test.ts`): it renders
// the intrinsic and the ref falls through to the raw engine node, the same fall-through the
// functional wrappers used to provide.
//
// Wrapping is itself vestigial — the engine resolves an AnimatedNode written into any prop of any
// host node (`core/engine/src/animated/host-binding.ts`), so `<view :style="{ opacity: v }">` needs
// no wrapper at all. These stay as RN-compatible aliases until the namespace is retired.
const AnimatedView = createAnimatedComponent('view');
const AnimatedText = createAnimatedComponent('text');
const AnimatedImage = createAnimatedComponent('image');
// `scroll-view` is a TAG now too (no more component, no more scroll-view/sticky-header cycle to
// dodge), so it takes the same eager shape as View/Text/Image above.
const AnimatedScrollView = createAnimatedComponent('scroll-view');

// LAZY, memoized getters, mirroring RN's `get FlatList()`. Kept deferred past module init even
// though the scroll-view cycle these once rode is gone (ScrollView above is eager now) — neither
// FlatList nor VirtualizedList imports this module, so there is no proven cycle left, but nothing
// forces one to stay absent either. Cheap insurance against a half-evaluated module handing back
// `undefined` and rendering nothing.
let animatedFlatList: ReturnType<typeof createAnimatedComponent> | undefined;
let animatedSectionList: ReturnType<typeof createAnimatedComponent> | undefined;

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
// (reduced motion/test env): the mock keeps the same surface but jumps each animation to its
// final value synchronously, no frames. The animated COMPONENTS stay live in both branches; only
// the drivers/value/operators/events half is swapped.
const drivers = Platform.isDisableAnimations ? AnimatedMock : liveDrivers;

export const Animated = {
  View: AnimatedView,
  Text: AnimatedText,
  Image: AnimatedImage,
  ScrollView: AnimatedScrollView,
  get FlatList(): ReturnType<typeof createAnimatedComponent> {
    animatedFlatList ??= createAnimatedComponent(FlatList);
    return animatedFlatList;
  },
  get SectionList(): ReturnType<typeof createAnimatedComponent> {
    animatedSectionList ??= createAnimatedComponent(SectionList);
    return animatedSectionList;
  },
  createAnimatedComponent,
  ...drivers,
};
