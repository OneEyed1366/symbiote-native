// The Animated namespace for @symbiote-native/solid. createAnimatedComponent applied to this
// adapter's primitives gives the six animated components RN exposes; the value graph, easing and
// imperative drivers come from @symbiote-native/engine (framework-agnostic), so both halves meet
// here in one object and `Animated.timing(new Animated.Value(0), …).start()` reads as it does in
// RN. Solid's JSX takes the dotted form directly — `<Animated.View/>` compiles to
// createComponent(Animated.View, …), no local alias needed.
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
import { View } from '../../components/view';
import { Text } from '../../components/text';
import { Image } from '../../components/image';
import { ScrollView } from '../../components/scroll-view';
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

// View/Text/Image are pure host primitives with no cycle back to here, so wrap them eagerly.
const AnimatedView = createAnimatedComponent(View);
const AnimatedText = createAnimatedComponent(Text);
const AnimatedImage = createAnimatedComponent(Image);

// The scrolling containers go behind memoized LAZY getters, mirroring RN's own
// `get ScrollView() { return require(…) }`: ScrollView's module chain pulls in
// scroll-view/sticky-header, which imports this namespace back, so wrapping at init would read
// ScrollView inside its own TDZ. Deferring past module init breaks the cycle. The wrappers carry
// no animation logic of their own — the native scroll-event attach belongs to ScrollView.
type IAnimatedComponent = ReturnType<typeof createAnimatedComponent>;

let animatedScrollView: IAnimatedComponent | undefined;
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
  View: AnimatedView,
  Text: AnimatedText,
  Image: AnimatedImage,
  get ScrollView(): IAnimatedComponent {
    animatedScrollView ??= createAnimatedComponent(ScrollView);
    return animatedScrollView;
  },
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
