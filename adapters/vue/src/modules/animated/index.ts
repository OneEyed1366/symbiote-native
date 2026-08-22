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
import { FlatList } from '../../components/flat-list';
import { SectionList } from '../../components/section-list';
import { createAnimatedComponent } from './create-animated-component';

export { createAnimatedComponent } from './create-animated-component';

// View/Text are pure host primitives; Image is the functional renderImage wrapper, and all expose
// their host node via ref fall-through, so wrap them eagerly.
const AnimatedView = createAnimatedComponent(View);
const AnimatedText = createAnimatedComponent(Text);
const AnimatedImage = createAnimatedComponent(Image);

// LAZY, memoized getters, mirroring RN's `get ScrollView()`. Every scrolling container reaches
// scroll-view/sticky-header, which imports this Animated namespace back, so a wrap at module
// scope captures whatever the half-evaluated cycle holds at that instant. Under a bundler's ESM
// interop that is `undefined`, not a ReferenceError - the wrapper builds fine and then renders
// nothing. Deferring past module init is what keeps it from firing. FlatList and SectionList
// reach ScrollView through VirtualizedList, so they sit on the same cycle and take the same shape.
let animatedScrollView: ReturnType<typeof createAnimatedComponent> | undefined;
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
  get ScrollView(): ReturnType<typeof createAnimatedComponent> {
    animatedScrollView ??= createAnimatedComponent(ScrollView);
    return animatedScrollView;
  },
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
