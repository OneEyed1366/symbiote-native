// The Animated namespace for @symbiote-native/react. createAnimatedComponent applied to
// the adapter's primitives gives Animated.View / Text / Image; the value graph,
// easing and imperative drivers come from @symbiote-native/engine (framework-agnostic,
// JS-driven). Both halves meet here in one `Animated` object so the
// familiar surface (`Animated.timing(new Animated.Value(0), …).start()`) works.

import {
  AnimatedValue,
  AnimatedValueXY,
  AnimatedColor,
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
import { FlatList } from '../../components/flat-list';
import { SectionList } from '../../components/section-list';
import { createAnimatedComponent } from './create-animated-component';
import { AnimatedMock } from '@symbiote-native/engine';

export { createAnimatedComponent } from './create-animated-component';
// The pure graph leaves now live in @symbiote-native/engine (they extend AnimatedWithChildren,
// no React); re-exported here so @symbiote-native/react's Animated surface is unchanged.
export {
  AnimatedProps,
  AnimatedStyle,
  AnimatedTransform,
} from '@symbiote-native/engine';

// View/Text/Image are pure host primitives, so wrap them eagerly.
const AnimatedView = createAnimatedComponent(View);
const AnimatedText = createAnimatedComponent(Text);
// The tag, not the `Image` name: that one is the STATICS namespace now (`modules/image`).
const AnimatedImage = createAnimatedComponent('image');

// There is no `Animated.ScrollView` any more, and nothing replaced it — the whole API is
// `<scroll-view style={{ opacity: v }} onScroll={Animated.event(…)}>`. A scroll wrapper's one
// remaining animated job looked like the native scroll-event attach, and that is engine-side for
// EVERY host node: `setEventListener` calls `bindAnimatedEvent` on any `on*` prop
// (`core/engine/src/node.ts`), and an AnimatedNode written into any style key is resolved by
// `routeProp`. Its lazy getter existed only to dodge a TDZ through `scroll-view/sticky-header`,
// which is deleted with the wrapper.
//
// The two below REMAIN because the list family is tier 3: a render prop decides their output shape
// in JS, so there is no tag for `<Animated.X>` to be an alias of. Both stay LAZY, mirroring RN's
// own `get FlatList() { return require(...) }`.
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

// RN's AnimatedExports.js:21 swaps the WHOLE namespace for the mock when the host
// reports isDisableAnimations (reduced motion / test env): the mock keeps the same
// surface but jumps each animation to its final value synchronously, no frames.
// The animated COMPONENTS (View/Text/Image + the lazy container getters) are live in
// both branches; only the drivers/value/operators/events half is swapped, exactly
// like RN spreading `...Animated` (impl or mock) over the same component getters.
const drivers = Platform.isDisableAnimations ? AnimatedMock : liveDrivers;

export const Animated = {
  View: AnimatedView,
  Text: AnimatedText,
  Image: AnimatedImage,
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
