// The Animated namespace for @symbiote-native/solid. The value graph, easing and imperative drivers
// come from @symbiote-native/engine (framework-agnostic), so both halves meet here in one object and
// `Animated.timing(new Animated.Value(0), …).start()` reads as it does in RN.
//
// THERE IS NO `Animated.View` / `Animated.Text` / `Animated.Image` / `Animated.ScrollView`, and
// nothing replaced any of them: `<view style={{ opacity: someAnimatedValue }}>` is the whole API
// for style, and `<scroll-view onScroll={Animated.event(…)}>` is the whole API for a native-driven
// scroll listener. The engine resolves an AnimatedNode written into any prop of any host node
// (`core/engine/src/animated/host-binding.ts`) — it publishes the current value, subscribes the
// leaf, writes each frame through its own targeted setNativeProps commit, and releases at the
// commit sweep; `setEventListener` calls `bindAnimatedEvent` on any `on*` prop for EVERY host node,
// not just a scroll one. Those four were aliases of the wrappers, and a wrapper is a tag now, which
// is not a value `<Animated.X>` can call.
//
// The two below REMAIN because they are tier 3: a render prop decides the list family's output
// shape in JS, so there is no tag for `<Animated.X>` to be an alias of.
//
// The NATIVE DRIVER is not this module's doing and must not be re-derived here. A
// useNativeDriver animation promotes the value graph itself (animations/base.ts ->
// value.__startNativeAnimation -> graph.__makeNative), and the props leaf follows automatically
// through graph.__addChild. This file only assembles the surface.

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
export type { IAnimatedComponentProps } from './create-animated-component';
// The pure graph leaves live in the engine (they extend AnimatedWithChildren, no framework);
// re-exported so this adapter's Animated surface matches React's.
export {
  AnimatedProps,
  AnimatedStyle,
  AnimatedTransform,
} from '@symbiote-native/engine';

// The list family goes behind memoized LAZY getters, mirroring RN's own
// `get FlatList() { return require(…) }`.
type IAnimatedComponent = ReturnType<typeof createAnimatedComponent>;

let animatedFlatList: IAnimatedComponent | undefined;
let animatedSectionList: IAnimatedComponent | undefined;

// The live, JS-driven driver half. RN's AnimatedImplementation.
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
// (reduced motion / test env): same surface, every animation jumping to its final value with no
// frames. The COMPONENTS stay live in both branches — only this half is swapped, exactly as RN
// spreads `...Animated` over the same component getters.
const drivers = Platform.isDisableAnimations ? AnimatedMock : liveDrivers;

export const Animated = {
  get FlatList(): IAnimatedComponent {
    animatedFlatList ??= createAnimatedComponent(FlatList);
    return animatedFlatList;
  },
  get SectionList(): IAnimatedComponent {
    animatedSectionList ??= createAnimatedComponent(SectionList);
    return animatedSectionList;
  },
  createAnimatedComponent,
  ...drivers,
};
