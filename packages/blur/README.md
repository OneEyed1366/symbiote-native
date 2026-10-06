# @symbiote-native/blur

[`expo-blur`](https://docs.expo.dev/versions/latest/sdk/blur-view/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. `BlurView` blurs
what is behind it, `BlurTargetView` marks the content Android blurs.

Built the same way as [`@symbiote-native/clipboard`](../clipboard)'s `ClipboardPasteButton`, an
`expo-modules-core` native view reached through `requireNativeViewManager` (see the
`symbiote-expo-native-module` project skill: why `expo-modules-core` is depended on directly and never
the `expo` meta-package, why the upstream JS is hand-ported into `core/`, and how autolinking finds the
native module). One render function in `core/` returns a descriptor and every adapter only turns it into
its own element.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --blur
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --blur
```

Either way: installs `@symbiote-native/blur` and wires the native autolinking automatically,
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/blur
```

Depends on `expo-blur` and `expo-modules-core` directly (regular dependencies, pinned to exact
versions, since this package's `core/` is hand-ported against one specific native API shape).
Never install `expo-blur` yourself, and never add the `expo` package to this project: it bundles
its own Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

`expo-blur`'s native code is discovered by `expo-modules-autolinking`, not by RN's own
`react-native.config.cjs` mechanism. Wire it into the native host app **once**, it covers this package
and every other `expo-modules-core` package with zero further changes. The steps and the
mechanics behind them are in the `symbiote-expo-native-module` skill and in
[`@symbiote-native/network`](../network)'s README; the reference app is `examples/expo-react`.

</details>

## Shape

```
src/core/                blur.ts - props, the blurMethod warning, watchBlurTarget, renderBlurView
                         (a View carrying style over an absolute-fill native blur, both platforms) and
                         renderBlurTargetView (native on Android, a plain View on iOS).
src/react/               @symbiote-native/blur/react   - BlurView, BlurTargetView
src/vue/                 @symbiote-native/blur/vue     - BlurView, BlurTargetView
src/svelte/              @symbiote-native/blur/svelte  - BlurView, BlurTargetView (.svelte)
src/solid/               @symbiote-native/blur/solid   - BlurView, BlurTargetView
src/angular/             @symbiote-native/blur/angular - BlurView, BlurTargetView
```

`blurTarget` is each adapter's own reference to a `BlurTargetView`. The package resolves it to a node
and waits for the commit (`watchBlurTarget`) before telling native, so a Vue or Svelte render order cannot
hand native a tag that does not exist yet.

## Use it

### React

```tsx
import { BlurTargetView, BlurView } from '@symbiote-native/blur/react';

const target = useRef<IHostInstance>(null);

<BlurTargetView ref={target}>
  <Image source={photo} />
</BlurTargetView>;
<BlurView blurTarget={target} blurMethod="dimezisBlurView" tint="light" intensity={60}>
  <Text>Over the blur</Text>
</BlurView>;
```

### Vue

```vue
<script setup lang="ts">
import { ref } from '@vue/runtime-core';
import { BlurTargetView, BlurView } from '@symbiote-native/blur/vue';

const target = ref(null);
</script>

<template>
  <BlurTargetView ref="target"><image :source="photo" /></BlurTargetView>
  <BlurView :blur-target="target" blur-method="dimezisBlurView" tint="light" :intensity="60">
    <text>Over the blur</text>
  </BlurView>
</template>
```

### Angular

```ts
import { BlurTargetView, BlurView } from '@symbiote-native/blur/angular';

@Component({
  imports: [BlurTargetView, BlurView],
  template: `
    <BlurTargetView #target><image [source]="photo" /></BlurTargetView>
    <BlurView [blurTarget]="target" blurMethod="dimezisBlurView" tint="light" [intensity]="60">
      <text>Over the blur</text>
    </BlurView>
  `,
})
export class Card {}
```

### Svelte

```svelte
<script lang="ts">
  import { BlurTargetView, BlurView } from '@symbiote-native/blur/svelte';

  let target = $state<unknown>();
</script>

<BlurTargetView bind:ref={target}><image source={photo} /></BlurTargetView>
<BlurView blurTarget={target} blurMethod="dimezisBlurView" tint="light" intensity={60}>
  <text>Over the blur</text>
</BlurView>
```

### Solid

```tsx
import { createSignal } from 'solid-js';
import { BlurTargetView, BlurView } from '@symbiote-native/blur/solid';

const [target, setTarget] = createSignal<IHostInstance>();

<BlurTargetView ref={setTarget}><image source={photo} /></BlurTargetView>;
<BlurView blurTarget={target()} blurMethod="dimezisBlurView" tint="light" intensity={60}>
  <text>Over the blur</text>
</BlurView>;
```

## API

```ts
<BlurView
  tint?={'default' | 'light' | 'dark' | 'extraLight' | 'regular' | system materials}
  intensity?={number}                  // 1..100, default 50
  blurMethod?={'none' | 'dimezisBlurView' | 'dimezisBlurViewSdk31Plus'}   // Android, default 'none'
  blurReductionFactor?={number}        // Android, divides the intensity, default 4
  blurTarget?={BlurTargetView ref}     // Android, needed by the dimezis methods
  style? testID? nativeID? onLayout? ...View accessibility and responder props
/>
<BlurTargetView ref>                   // native on Android, a plain View on iOS
```

Ported from upstream's `BlurView.tsx` and `BlurTargetView.tsx`.

## Notes

- **Android blurs nothing until you ask for it.** `blurMethod` defaults to `none`, which is only a
  translucent view. Pick `dimezisBlurView` (or `dimezisBlurViewSdk31Plus`) and pass a `blurTarget`.
  Without a target the package warns and falls back to `none`.
- **One `BlurTargetView` can serve many `BlurView`s**, as long as they all sit inside its bounds.
  That is cheaper than one target per blur.
- **The blur view must be above what it blurs.** Place it after the content in the tree (or give it
  a higher `zIndex`), not beside or under it.
- **Every iOS tint adds a translucent layer.** Each `tint` is a system material that sits over the
  blur, and iOS exposes no plain blur radius. Android and the fallback can go without a tint.
- **`blurReductionFactor` is Android only.** It divides the intensity to bring the Android blur
  closer to iOS.
- **Without the native view you get a plain `View`.** The package logs
  `BlurView is not available on this platform` and renders your children without a blur.
- **Not ported.** The web variant (`BlurView.web.tsx`, `getBackgroundColor`) and the Reanimated `getAnimatableRef` hook. Angular templates spell the Android target tag statically, so an `__expo_app_identifier__` suffix makes it warn instead of render.

## Common questions

- **Nothing is blurred on Android.** `blurMethod` defaults to `none`. Wrap the content in a
  `BlurTargetView`, pass its ref as `blurTarget` and set `blurMethod="dimezisBlurView"`.
- **The blur does not follow a scrolling list.** Render the blur view after the content, or give it
  a higher `zIndex`. Beside or below the list it shows nothing.
- **Inside a `Modal` on Android.** Put the `Modal` inside the `BlurTargetView` and point the
  `BlurView` in the `Modal` at that target. Not demoed in the canary apps.
- **Corners are not rounded.** Put `overflow: 'hidden'` next to the `borderRadius`.
- **Missing on some iPhones.** Settings > Accessibility > Display & Text Size > Reduce Transparency
  turns blur off. Render a solid fallback.
- **No tint.** Not possible on iOS, every system blur style adds a tint layer.
- **Animating `intensity`.** It is a plain prop, drive it from state, a signal or a rune.
- **Android build cannot find `BlurView`.** The library comes from JitPack, which React Native's
  Gradle plugin adds by default. It fails if `react.includeJitpackRepository=false`.

Sources: [Expo docs: BlurView](https://docs.expo.dev/versions/latest/sdk/blur-view/),
[expo/expo#6613](https://github.com/expo/expo/issues/6613),
[expo/expo#44165](https://github.com/expo/expo/issues/44165),
[expo/expo#18615](https://github.com/expo/expo/issues/18615),
[expo/expo#34737](https://github.com/expo/expo/issues/34737),
[expo/expo#49240](https://github.com/expo/expo/issues/49240),
[expo/expo#32781](https://github.com/expo/expo/issues/32781),
[expo/expo#34141](https://github.com/expo/expo/issues/34141).

## Test it

No device is needed for the logic. The core tests (`src/core/*.test.ts`) replace `expo-modules-core`
(`requireNativeViewManager`, `Platform`) and assert the descriptor a render function returns. The
adapter tests (`src/{react,vue,solid,angular}/**/*.test.*`, `vitest`) render the real component over the
recording Fabric with an injected view config and assert the committed payload, and Svelte's
`*.smoke.test.ts` compile the `.svelte` files and mount them. Painting itself is verified on a device in
the six `examples/expo-*` canary apps (`examples/expo-react`, `examples/expo-vue-sfc`,
`examples/expo-vue-tsx`, `examples/expo-svelte`, `examples/expo-solid`, `examples/expo-angular`), see the
parent [README](../../README.md).
