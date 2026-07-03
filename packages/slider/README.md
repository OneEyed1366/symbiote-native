# @symbiote-native/slider

A wrapper package for [SymbioteNative](../../README.md) that makes the third-party native
`@react-native-community/slider` view usable from **every** adapter — React, Vue, and Angular —
not just React. The library's default export is a React component (it calls hooks off the React
dispatcher), so a non-React adapter renders it with a null dispatcher and it throws. This package
reaches the native `RNCSlider` view directly through the engine's `createNode`-by-ViewConfig path
instead of importing the library's React component — the same mechanism SymbioteNative uses for its
own primitives. See the `symbiote-third-party-native-view` skill and ADR 0027 for the full
mechanism and rationale.

## Shape

One framework-agnostic core, one thin entry per adapter, selected through the package's `exports`
map:

```
src/core/       pure folds (value sanitation, limit/disabled resolution, step-indicator layout)
                + renderSlider/renderSliderNative → Descriptor, the agnostic ISliderProps
src/register.ts side-effect import of RNCSlider's codegen spec — registers its ViewConfig
                (never the library's React Slider.tsx)
src/react/      @symbiote-native/slider/react — forwardRef FC + descriptorToReact
src/vue/        @symbiote-native/slider/vue   — defineComponent + descriptorToVue
src/angular/    @symbiote-native/slider/angular — Angular component + descriptorToAngular
```

Each adapter entry imports `../register` first (so the ViewConfig is registered before the
component ever mounts), then exposes a platform-split `Slider`. The core is written once; every
adapter inherits the same folding logic and the same `ISliderProps` surface (extended per-adapter
only where a field carries a framework element — the custom `StepMarker` is a React render prop
but a Vue scoped slot).

## Packaging — one dependency, not two

A consuming app depends on `@symbiote-native/slider` only — never on
`@react-native-community/slider` directly. `@symbiote-native/slider` owns the native dependency and
ships `react-native.config.cjs` (points RN's Android autolinking at the nested native lib's
Android sources) and `symbiote-slider.podspec` (the iOS proxy pod), so RN autolinking discovers
`@symbiote-native/slider` itself as the native package. Plain transitive native deps do **not**
autolink; this proxy-package shape is the verified escape hatch (`npx react-native config` lists
`@symbiote-native/slider` with iOS + Android config in `examples/react`, `examples/vue-sfc`,
`examples/vue-tsx`, and `examples/angular`).

## Use it

```tsx
// React — examples/react/App.tsx
import { Slider } from '@symbiote-native/slider/react';

<Slider
  value={volume}
  onValueChange={setVolume}
  minimumValue={0}
  maximumValue={1}
  step={0.01}
  minimumTrackTintColor="#7fb5ff"
  maximumTrackTintColor="#334155"
  thumbTintColor="#ffffff"
/>
```

```vue
<!-- Vue — examples/vue-sfc/App.vue -->
<script setup lang="ts">
import { Slider } from '@symbiote-native/slider/vue';
</script>
<template>
  <Slider
    testID="volume-slider"
    :value="volume"
    @update:value="volume = $event"
  />
</template>
```

```ts
// Angular — examples/angular/App.ts
import { Slider } from '@symbiote-native/slider/angular';
// ... Slider added to the component's `imports`, used the same way in its template.
```

Colors and images are passed raw in every adapter — the engine derives `RNCSlider`'s color/image
processors from its own ViewConfig at runtime, so there is nothing to pre-resolve on the app side.

## Test it

Headless component tests live next to each adapter entry
(`src/{react,vue,angular}/slider/slider.test.{ts,tsx}`) and inject a fake ViewConfig via
`setNativeViewConfigSource`, so they run without a real Fabric host. Native rendering is verified
on-device (see the parent [README](../../README.md) for the project's testing model).
