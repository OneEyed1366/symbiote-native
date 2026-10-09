# @symbiote-native/reanimated

`react-native-reanimated` 4.7 and `react-native-worklets` 0.13 for [SymbioteNative](../../README.md).
Shared values, animated styles, layout animations and the worklets API run on the UI thread, against the
native half of Reanimated untouched.

Only the React adapter exists so far. Vue, Svelte, Solid and Angular follow, and the package is not
published as parity-complete before they do. Built on the upstream hook helpers, with the React
bindings replaced by the engine's own: see the `symbiote-reanimated-port` skill.

## Install

Not yet a CLI layer. Reanimated keeps its native half in your app, so the app lists both native
packages next to this one:

```bash
npm install @symbiote-native/reanimated react-native-reanimated@4.7.1 react-native-worklets@0.13.0
```

Then, in `babel.config.js`, the worklets plugin goes **last**:

```js
module.exports = { presets: ['module:@react-native/babel-preset'], plugins: ['react-native-worklets/plugin'] };
```

Run `pod install` in `ios/` and rebuild. `react-native` stays an explicit top-level dependency of the app.

## Shape

```
src/core/        shared controllers over the upstream helpers, no framework in them
src/react/       hooks/ (useAnimatedStyle, useDerivedValue, …), Animated.*, components
src/register.ts  the engine claims, imported bare so a release build keeps them
```

`@symbiote-native/reanimated` is `core`; `@symbiote-native/reanimated/react` adds the hooks and
components and re-exports `core`.

## Use it

```tsx
import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from '@symbiote-native/reanimated/react';

export function Box() {
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ translateX: x.value }] };
  });
  useEffect(() => {
    x.value = withSpring(100);
  }, [x]);
  return <Animated.View style={style} />;
}
```

`Animated.View`, `Text`, `Image` are the host tags themselves, so every node takes an animated
style. `createAnimatedComponent(X)` and `createCSSAnimatedComponent(X)` return `X`. `entering`, `exiting`, `layout`, `animatedProps` and
`sharedTransitionTag` work on them as upstream.

`Animated.ScrollView` and `Animated.FlatList` are thin components, as upstream's are: they ask for a scroll
event every frame unless told otherwise, the first takes `scrollViewOffset`, the second
`skipEnteringExitingAnimations`. A `TextInput` tag that takes `animatedProps` is exported next to them, which
upstream gets by wrapping a component. Every event prop of these takes the result of `useEvent`,
`useAnimatedScrollHandler` or `useComposedEventHandler`.

## API

The upstream surface at 4.7.1, with upstream signatures:

```ts
// hooks, from /react
useSharedValue, useDerivedValue, useAnimatedStyle, useAnimatedProps, useAnimatedReaction,
useAnimatedRef, useAnimatedScrollHandler, useScrollOffset, useEvent, useHandler,
useComposedEventHandler, useFrameCallback, useAnimatedSensor, useAnimatedKeyboard,
useReducedMotion, useTimestamp
// components, from /react
LayoutAnimationConfig, SharedTransitionBoundary, ReducedMotionConfig, PerformanceMonitor
// everything else, from core
withTiming, withSpring, withDecay, Easing, interpolate, FadeIn, …, measure, scrollTo, getViewProp
```

## Known gaps

- CSS `animation*`, `transition*`, `@keyframes` (also from another file), the `onCSS*` callbacks and
  the states `:hover`, `:focus`, `:focus-within`, `:active`, `:active-deepest` are wired. A state
  works on the last compound of a selector only, and `:active` is Reanimated's, not the press machine's.
  A state in a style with no package registered throws in a dev bundle and the property is ignored in a release one.
- `Animated.FlatList` lacks `itemLayoutAnimation` and `CellRendererComponentStyle`: they need
  `CellRendererComponent` on the list components, which no adapter has yet.
- `NativeEventsManager` is replaced by the engine's event binding, not exported.
- Shared element transitions follow Reanimated's own flag, `ENABLE_SHARED_ELEMENT_TRANSITIONS`, off by default.
- Verified headless only. Nothing is device-tested yet.

## Test it

Tests run under vitest with `react-native-worklets` aliased to its mock and the worklets plugin applied
to the package source, over the fake Fabric. `pnpm exec vitest run packages/reanimated`.

The demo screen of `examples/react` is mounted by `src/react/demo-screen.test.ts` against the working tree,
and `tsc -p packages/reanimated/tsconfig.demo.json` type-checks it the same way.
