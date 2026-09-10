// The Animated namespace for @symbiote-native/svelte. The value graph, easing, interpolation and
// drivers come from @symbiote-native/engine (framework-agnostic, JS-driven), spread in verbatim.
//
// There is no `Animated.View` / `Animated.Text` / `Animated.Image` any more, and nothing replaced
// them: `<view style={{ opacity: someAnimatedValue }}>` is the whole API. The engine resolves an
// AnimatedNode written into any prop of any host node (`core/engine/src/animated/host-binding.ts`):
// it publishes the current value, subscribes the leaf, writes each frame through its own targeted
// setNativeProps commit, and releases at the commit sweep. `createAnimatedComponent` brokered
// between the value graph and the node's Fabric tag, and both of those were already engine-side.
//
// Those three were aliases of the wrappers, and the wrappers are gone — a primitive is a tag now,
// which is not a value `<Animated.X>` can call. `Animated.ScrollView` left the same way on
// 2026-09-10: `bindAnimatedEvent` (node.ts, from `setEventListener`) attaches a native-driven event
// on ANY host node, which was the one job a scroll wrapper still looked like it had. The whole API
// is `<scroll-view style={{ opacity: v }} p={{ onScroll: Animated.event(…) }}>`.
//
// The two below REMAIN because the LIST family is tier 3: a render prop decides their output shape
// in JS, so there is no tag for `<Animated.X>` to be an alias of.
//
// A consumer animating their OWN component wraps nothing either: any component that forwards
// `style` down to a Symbiote primitive accepts an AnimatedNode by construction.

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
import FlatList from '../../components/flat-list/index.svelte';
import SectionList from '../../components/section-list/index.svelte';

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
// final value synchronously, no frames. Only this half is swapped — the component names below are
// the same references either way, exactly like RN spreading `...Animated` (impl or mock) over one
// set of components.
const drivers = Platform.isDisableAnimations ? AnimatedMock : liveDrivers;

// ANNOTATED, and it is not decoration. svelte2tsx emits each component's type as a
// module-private `$$IsomorphicComponent`, so an INFERRED object type cannot be written into this
// package's `.d.ts` — the declaration emit fails with "has or is using name
// '$$IsomorphicComponent' … but cannot be named". It only became reachable when the three
// remaining members stopped going through `createAnimatedComponent`, whose declared return type
// was nameable. A `typeof import()` query names the module instead of the interface, which is
// emittable, and it keeps each component's generics.
//
// Invisible to `tsc --build` — the declaration emit is its own stage (`pnpm pack` ->
// `scripts/emit-svelte-declarations.mjs`), so this only fails at publish.
interface IAnimatedNamespace {
  FlatList: typeof import('../../components/flat-list/index.svelte').default;
  SectionList: typeof import('../../components/section-list/index.svelte').default;
}

export const Animated: IAnimatedNamespace & typeof drivers = {
  FlatList,
  SectionList,
  ...drivers,
};
