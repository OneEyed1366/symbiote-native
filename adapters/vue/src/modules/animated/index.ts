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
import { View, Text } from '../../components';
import { Image } from '../../components/image';
import { ScrollView } from '../../components/scroll-view';
import { createAnimatedComponent } from './create-animated-component';

export { createAnimatedComponent } from './create-animated-component';

// View/Text are pure host primitives; Image is the functional renderImage wrapper, and all expose
// their host node via ref fall-through, so wrap them eagerly.
const AnimatedView = createAnimatedComponent(View);
const AnimatedText = createAnimatedComponent(Text);
const AnimatedImage = createAnimatedComponent(Image);

// LAZY, memoized getter, mirroring RN's `get ScrollView()`: ScrollView's module chain imports
// this Animated namespace back (sticky headers), so a static createAnimatedComponent(ScrollView)
// at init could read ScrollView inside its own TDZ. Deferring the wrap past module init avoids the cycle.
let animatedScrollView: ReturnType<typeof createAnimatedComponent> | undefined;

// Animated.FlatList / Animated.SectionList are intentionally OMITTED, not faked - a named gap,
// not a silent drop.

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
  get ScrollView(): ReturnType<typeof createAnimatedComponent> {
    animatedScrollView ??= createAnimatedComponent(ScrollView);
    return animatedScrollView;
  },
  createAnimatedComponent,
  ...drivers,
};
