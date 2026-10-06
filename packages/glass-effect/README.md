# @symbiote-native/glass-effect

[`expo-glass-effect`](https://docs.expo.dev/versions/latest/sdk/glass-effect/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. Liquid Glass
native views on iOS 26, a plain `View` everywhere else.

Built the same way as [`@symbiote-native/clipboard`](../clipboard)'s `ClipboardPasteButton`, an
`expo-modules-core` native view reached through `requireNativeViewManager` (see the
`symbiote-expo-native-module` project skill: why `expo-modules-core` is depended on directly and never
the `expo` meta-package, why the upstream JS is hand-ported into `core/`, and how autolinking finds the
native module). One render function in `core/` returns a descriptor and every adapter only turns it into
its own element.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --glass-effect
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --glass-effect
```

Either way: installs `@symbiote-native/glass-effect` and wires the native autolinking automatically,
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/glass-effect
```

Depends on `expo-glass-effect` and `expo-modules-core` directly (regular dependencies, pinned to exact
versions, since this package's `core/` is hand-ported against one specific native API shape).
Never install `expo-glass-effect` yourself, and never add the `expo` package to this project: it bundles
its own Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

`expo-glass-effect`'s native code is discovered by `expo-modules-autolinking`, not by RN's own
`react-native.config.cjs` mechanism. Wire it into the native host app **once**, it covers this package
and every other `expo-modules-core` package with zero further changes. The steps and the
mechanics behind them are in the `symbiote-expo-native-module` skill and in
[`@symbiote-native/network`](../network)'s README; the reference app is `examples/expo-react`.

</details>

## Shape

```
src/core/                glass-effect.ts - props, isLiquidGlassAvailable, isGlassEffectAPIAvailable,
                         renderGlassView / renderGlassContainer (native root on iOS, a plain View
                         without the glass props elsewhere).
src/react/               @symbiote-native/glass-effect/react   - GlassView, GlassContainer
src/vue/                 @symbiote-native/glass-effect/vue     - GlassView, GlassContainer
src/svelte/              @symbiote-native/glass-effect/svelte  - GlassView, GlassContainer (.svelte)
src/solid/               @symbiote-native/glass-effect/solid   - GlassView, GlassContainer
src/angular/glass/       @symbiote-native/glass-effect/angular - GlassView, GlassContainer
```

Angular keeps one file set per platform (`index.ios.ts`, `index.android.ts`) because a template spells
the native tag statically, so an `__expo_app_identifier__` suffix makes it warn instead of render.
`native-link.json` declares `android.modules: []`, upstream has no Android folder.

## Use it

### React

```tsx
import { GlassContainer, GlassView } from '@symbiote-native/glass-effect/react';

<GlassContainer spacing={8}>
  <GlassView glassEffectStyle="clear" tintColor="rgba(255, 59, 48, 0.7)" isInteractive>
    <Text>Glass</Text>
  </GlassView>
</GlassContainer>;
```

### Vue

```vue
<script setup lang="ts">
import { GlassContainer, GlassView } from '@symbiote-native/glass-effect/vue';
</script>

<template>
  <GlassContainer :spacing="8">
    <GlassView glass-effect-style="clear" tint-color="rgba(255, 59, 48, 0.7)" is-interactive>
      <text>Glass</text>
    </GlassView>
  </GlassContainer>
</template>
```

### Angular

```ts
import { GlassContainer, GlassView } from '@symbiote-native/glass-effect/angular';

@Component({
  imports: [GlassContainer, GlassView],
  template: `
    <GlassContainer [spacing]="8">
      <GlassView glassEffectStyle="clear" tintColor="rgba(255, 59, 48, 0.7)" [isInteractive]="true">
        <text>Glass</text>
      </GlassView>
    </GlassContainer>
  `,
})
export class Card {}
```

### Svelte

```svelte
<script lang="ts">
  import { GlassContainer, GlassView } from '@symbiote-native/glass-effect/svelte';
</script>

<GlassContainer spacing={8}>
  <GlassView glassEffectStyle="clear" tintColor="rgba(255, 59, 48, 0.7)" isInteractive={true}>
    <text>Glass</text>
  </GlassView>
</GlassContainer>
```

### Solid

```tsx
import { GlassContainer, GlassView } from '@symbiote-native/glass-effect/solid';

<GlassContainer spacing={8}>
  <GlassView glassEffectStyle="clear" tintColor="rgba(255, 59, 48, 0.7)" isInteractive>
    <text>Glass</text>
  </GlassView>
</GlassContainer>;
```

## API

```ts
<GlassView
  glassEffectStyle?={'regular' | 'clear' | 'none' | { style, animate, animationDuration }}
  tintColor?={ColorValue | PlatformColor | DynamicColorIOS}
  isInteractive?={boolean}             // default false
  colorScheme?={'auto' | 'light' | 'dark'}
  style? testID? nativeID? onLayout? ...View accessibility and responder props
/>
<GlassContainer spacing?={number} ...>   // views inside blend when closer than `spacing`

isLiquidGlassAvailable(): boolean        // system, compiler and Info.plist checks, false off iOS
isGlassEffectAPIAvailable(): boolean     // the API exists at runtime, some iOS 26 betas lack it
```

Ported from upstream's `GlassView.tsx` and `GlassContainer.tsx`.

## Notes

- **iOS 26 and later only.** Older iOS, Android and the fallback render a plain `View` without the
  glass props, and `isLiquidGlassAvailable()` reports `false` there.
- **`isLiquidGlassAvailable()` checks the build, not only the phone.** It validates the system
  version, the compiler version the app was built with and the `UIDesignRequiresCompatibility`
  setting in `Info.plist`. `isGlassEffectAPIAvailable()` checks the API at runtime, because some iOS
  26 betas lack it and crash.
- **Glass does not survive an opacity of 0.** Setting `opacity` to `0` on a `GlassView` or on any
  parent stops the glass from rendering at all. Fade it with the `animate` and `animationDuration`
  fields of `glassEffectStyle` instead.
- **Merge glass views with `GlassContainer`.** Views inside one container blend into each other when
  they come within `spacing` of each other.
- **The native view is the root and the children sit inside it**, so what you put in a `GlassView`
  is laid out and touched like the content of any `View`.
- **Not ported.** Nothing: the upstream package has no web or Android variant beyond the plain `View`.

## Common questions

- **A plain view, no glass.** Needs iOS 26 or later, an app built with the iOS 26 SDK (Xcode 26) and
  no `UIDesignRequiresCompatibility = true` in `Info.plist`. Log `isLiquidGlassAvailable()`.
- **The glass disappears when its parent fades.** An opacity of 0 on the view or any ancestor stops
  it rendering (an iOS 26.1 bug). Fade with `glassEffectStyle={{ style, animate: true,
  animationDuration }}` or toggle the style to `none` while a wrapper is invisible.
- **`colorScheme` does not update.** Fixed upstream in `expo-glass-effect` 55.0.8, update.
- **One corner radius is ignored.** Fixed upstream before the SDK 55 release, update.
- **Merging two shapes.** Put them in one `GlassContainer` and set `spacing`.
- **Android.** No upstream implementation, both components render a plain `View`.

Sources: [Expo docs: GlassEffect](https://docs.expo.dev/versions/latest/sdk/glass-effect/),
[expo/expo#41024](https://github.com/expo/expo/issues/41024),
[expo/expo#50097](https://github.com/expo/expo/issues/50097),
[expo/expo#43743](https://github.com/expo/expo/issues/43743),
[expo/expo#40778](https://github.com/expo/expo/issues/40778).

## Test it

No device is needed for the logic. The core tests (`src/core/*.test.ts`) replace `expo-modules-core`
(`requireNativeViewManager`, `Platform`) and assert the descriptor a render function returns. The
adapter tests (`src/{react,vue,solid,angular}/**/*.test.*`, `vitest`) render the real component over the
recording Fabric with an injected view config and assert the committed payload, and Svelte's
`*.smoke.test.ts` compile the `.svelte` files and mount them. Painting itself is verified on a device in
the six `examples/expo-*` canary apps (`examples/expo-react`, `examples/expo-vue-sfc`,
`examples/expo-vue-tsx`, `examples/expo-svelte`, `examples/expo-solid`, `examples/expo-angular`), see the
parent [README](../../README.md).
