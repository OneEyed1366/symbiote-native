# @symbiote-native/reanimated

`react-native-reanimated` 4.7 and `react-native-worklets` 0.13 for [SymbioteNative](../../README.md), on
every adapter: React, Vue, Svelte, Solid and Angular. Shared values, animated styles, layout animations,
CSS animations and the worklets API run on the UI thread, against the native half of Reanimated untouched.

All five adapters carry the whole upstream export list. `src/surface-parity.test.ts` compares every name
with the entry of each adapter. The hooks are built on the upstream hook helpers with the React bindings
replaced by the engine's own: see the `symbiote-reanimated-port` skill.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --reanimated
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --reanimated
```

Either way the layer installs this package with its two native peers and writes
`react-native-worklets/plugin` last in `babel.config.js`. `pod install` stays with you.
See [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI)</summary>

Reanimated keeps its native half in your app, so the app lists both native packages next to this one:

```bash
npm install @symbiote-native/reanimated react-native-reanimated@4.7.1 react-native-worklets@0.13.0
```

In `babel.config.js` the worklets plugin goes **last**:

```js
module.exports = { presets: ['module:@react-native/babel-preset'], plugins: ['react-native-worklets/plugin'] };
```

Vue SFC and Svelte need nothing more. Their Metro transformers turn the plugin's source maps off for
`.vue` and `.svelte` files, as those are compiled under a name that is not on disk.

Run `pod install` in `ios/`, rebuild, and start Metro once with `--reset-cache`.
`react-native` stays an explicit top-level dependency of the app.

</details>

## Shape

```
src/core/        shared controllers over the upstream helpers, no framework in them
src/react/       hooks/, Animated.*, components
src/vue/         composables/, Animated.*, components
src/svelte/      runes/, Animated.*, .svelte components
src/solid/       primitives/, Animated.*, components
src/angular/     services/, components
src/register.ts  the engine claims, imported bare so a release build keeps them
```

`@symbiote-native/reanimated` is `core`. `@symbiote-native/reanimated/<framework>` adds the hooks and
components of that framework and re-exports `core`.

`Animated.View`, `Text` and `Image` are the host tags themselves, so every node takes an animated style.
`createAnimatedComponent(X)` and `createCSSAnimatedComponent(X)` return `X`.

`Animated.ScrollView` and `Animated.FlatList` are thin components, as upstream's are. They ask for a scroll
event every frame unless told otherwise, the first takes `scrollViewOffset`, the second
`skipEnteringExitingAnimations`. A `TextInput` tag that takes `animatedProps` is exported next to them.
Every event prop of these takes the result of `useEvent`, `useAnimatedScrollHandler` or
`useComposedEventHandler`.

## Use it

The same box in every adapter: a shared value, an animated style that reads it in a worklet, and a spring
started on mount.

**React**

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

**Vue**

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useSharedValue, useAnimatedStyle, withSpring } from '@symbiote-native/reanimated/vue';

const x = useSharedValue(0);
const style = useAnimatedStyle(() => {
  'worklet';
  return { transform: [{ translateX: x.value }] };
});
onMounted(() => {
  x.value = withSpring(100);
});
</script>

<template>
  <view :style="style" />
</template>
```

**Svelte**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { useSharedValue, useAnimatedStyle, withSpring } from '@symbiote-native/reanimated/svelte';

  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ translateX: x.value }] };
  });
  onMount(() => {
    x.value = withSpring(100);
  });
</script>

<view {style} />
```

**Solid**

```tsx
import { onMount } from 'solid-js';
import { useSharedValue, useAnimatedStyle, withSpring } from '@symbiote-native/reanimated/solid';

export function Box() {
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ translateX: x.value }] };
  });
  onMount(() => {
    x.value = withSpring(100);
  });
  return <view style={style} />;
}
```

**Angular**

```ts
import { Component, OnInit } from '@angular/core';
import { SYMBIOTE_ELEMENTS, SymbioteHostPropsDirective } from '@symbiote-native/angular';
import { useSharedValue, useAnimatedStyle, withSpring } from '@symbiote-native/reanimated/angular';

// A worklet closes over the locals of its factory, as `this` does not cross to the UI runtime
function createBox() {
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ translateX: x.value }] };
  });
  return { x, props: { style } };
}

@Component({
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, SymbioteHostPropsDirective],
  template: `<view [symbioteHostProps]="box.props"></view>`,
})
export class Box implements OnInit {
  readonly box = createBox();
  ngOnInit(): void {
    this.box.x.value = withSpring(100);
  }
}
```

Angular runs the functions in an injection context: a constructor, a field initializer, or
`runInInjectionContext`. A host tag takes `entering`, `exiting` and `layout` only through
`[symbioteHostProps]`.

### Vue, Svelte, Solid and Angular read a changing value inside the updater

Their setup runs once. So a changing value is read **inside** the updater, the way the framework reads it:
`props.scale` in Vue, Svelte and Solid, `scale()` for an Angular signal. The hook follows what the updater
reads and starts the mapper again over a fresh copy of the closure when it changes.

A value copied into a plain variable outside the updater (`const s = props.scale`) is frozen, which is those
frameworks' own rule. A reactive value cannot be tracked in an event handler or a frame callback: pass it
through a shared value.

Svelte and Solid write the tag (`<view p={{ entering: FadeIn }}>`, `<view style={style}>`) and take
components for `LayoutAnimationConfig`, `SharedTransitionBoundary`, `PerformanceMonitor`,
`ReducedMotionConfig` and the scroll view and list. Vue takes the same as components and slots.

Angular has `AnimatedScrollView` (the props of the tag go in `[scrollViewProps]`, as a component cannot name
them all), `AnimatedFlatList` (a `FlatList` with every input, output and slot, plus `itemLayoutAnimation`,
`skipEnteringExitingAnimations` and `cellRendererComponentStyle`), `LayoutAnimationConfig`,
`SharedTransitionBoundary`, `PerformanceMonitor` and `ReducedMotionConfig`.

## API

The upstream surface at 4.7.1, with upstream signatures. The full list with a line per name is on the
docs site, in Packages, Bare, Reanimated.

```ts
// hooks, from /react (the same names from every adapter)
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
- `NativeEventsManager` is exported with upstream's attach, detach and update logic. It takes the
  tag from the engine instead of `findNodeHandle`, and the engine's own event binding does not use it:
  a host node has no component to hand it.
- Shared element transitions follow Reanimated's own flag, `ENABLE_SHARED_ELEMENT_TRANSITIONS`, off by default.
  Turn it on in the app's `package.json` under `reanimated.staticFeatureFlags` and reinstall the pods or
  rebuild Android: the flag is baked into the native build. Every example app has it on.
- Checked on an iOS simulator and on Android in all five adapters.
  In a dev build a prop that changes in Vue, Svelte or Solid reaches the UI thread as a copy; the headless
  test proves the copy.
- `animatedProps` takes handles only. Upstream also copies a plain object into static props, which a normal prop does as well.
- Every example app has the same demo screen of fourteen sections: `react`, `vue-tsx`, `vue-sfc`, `svelte`,
  `solid` and `angular`. `useTimestamp(isActive)` reads its flag once in the setup-once frameworks, so their
  clock readout pauses itself.

## Common questions

- **"Failed to create a worklet", or a hook throws that it needs a worklet.** The worklets plugin is missing
  from `babel.config.js` or is not the last entry. Put it last and restart Metro with `--reset-cache`.
- **"Native part of Reanimated doesn't seem to be initialized", or a version mismatch.** The app was not
  rebuilt after the install or an upgrade. Run `pod install` and rebuild.
- **"Unable to find a specification for RNWorklets".** `react-native-worklets` is not installed. Add
  `0.13.0` next to `react-native-reanimated` `4.7.1`.
- **The box jumps instead of animating.** `x.value = 100` sets the value at once. Assign an animation:
  `x.value = withTiming(100)`.
- **The style ignores a prop in Vue, Svelte, Solid or Angular.** The prop is read outside the updater.
  Read it inside, or move it into a shared value.
- **Shared element transitions do nothing.** The flag above is off, and it needs a rebuild after you set it.
- **`[entering]` fails to compile in an Angular template.** Use `[symbioteHostProps]`, and list classes in
  `imports`, never a tag name.

Sources: [Reanimated troubleshooting](https://docs.swmansion.com/react-native-reanimated/docs/guides/troubleshooting),
[Reanimated compatibility table](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility).

## Test it

Tests run under vitest with `react-native-worklets` aliased to its mock and the worklets plugin applied
to the package source, over the fake Fabric. `pnpm exec vitest run packages/reanimated`.

The demo screen of `examples/react` is mounted by `src/react/demo-screen.test.ts` against the working tree,
and `tsc -p packages/reanimated/tsconfig.demo.json` type-checks it the same way. The layout animation
proxy is exercised against the real native sources by the itests in `core/engine/cpp/tests/js`.
