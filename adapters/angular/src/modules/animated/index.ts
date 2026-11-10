// The Animated namespace for @symbiote-native/angular: the Angular twin of adapters/vue/src/modules/
// animated/index.ts. The animated COMPONENTS (View / Text / Image / ScrollView) are explicit
// standalone components (Angular has no runtime HOC — see create-animated-component.ts); the
// value graph, easing and imperative drivers come from @symbiote-native/engine (framework-agnostic,
// JS-driven), spread in verbatim. Both halves meet here so the familiar surface,
// `Animated.timing(new Animated.Value(0), …).start()`, works against the Angular-driven engine.

import {
  AnimatedDrivers,
  AnimatedMock,
  Platform,
} from '@symbiote-native/engine';
import {
  AnimatedFlatList,
  AnimatedImage,
  AnimatedScrollView,
  AnimatedSectionList,
  AnimatedText,
  AnimatedView,
  createAnimatedComponent,
} from './create-animated-component';

export {
  AnimatedComponentBase,
  AnimatedFlatList,
  AnimatedImage,
  AnimatedScrollView,
  AnimatedSectionList,
  AnimatedText,
  AnimatedView,
  createAnimatedComponent,
} from './create-animated-component';

// ScrollView is exposed DIRECTLY, not behind the lazy getter the React/Vue modules use: that
// getter only exists to defer a RUNTIME createAnimatedComponent(ScrollView) past module init so
// it cannot read ScrollView inside its own TDZ during an import cycle. AnimatedScrollView here is
// a statically-declared component that never reads the ScrollView class at init (it targets the
// `scroll-view` host by string), so there is no cycle to defer.
//
// FlatList / SectionList are exposed as explicit AOT-safe list entries now that the Angular list
// components exist. Angular still cannot synthesize arbitrary animated wrappers at runtime; custom
// animated components remain explicit standalone components over AnimatedComponentBase.

// RN swaps the WHOLE driver namespace for the mock when the host reports isDisableAnimations
// (reduced motion / test env): the mock keeps the same surface but jumps each animation to its
// final value synchronously, no frames. The animated COMPONENTS are live in both branches; only
// the drivers/value/operators/events half is swapped, exactly like RN spreading `...Animated`
// (impl or mock) over the same components.
const drivers = Platform.isDisableAnimations ? AnimatedMock : AnimatedDrivers;

export const Animated = {
  View: AnimatedView,
  Text: AnimatedText,
  Image: AnimatedImage,
  ScrollView: AnimatedScrollView,
  FlatList: AnimatedFlatList,
  SectionList: AnimatedSectionList,
  createAnimatedComponent,
  ...drivers,
};
