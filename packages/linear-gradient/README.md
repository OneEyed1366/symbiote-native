# @symbiote-native/linear-gradient

[`expo-linear-gradient`](https://docs.expo.dev/versions/latest/sdk/linear-gradient/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. A native view that
paints a multi-color gradient behind its children.

Built the same way as [`@symbiote-native/clipboard`](../clipboard)'s `ClipboardPasteButton`, an
`expo-modules-core` native view reached through `requireNativeViewManager` (see the
`symbiote-expo-native-module` project skill: why `expo-modules-core` is depended on directly and never
the `expo` meta-package, why the upstream JS is hand-ported into `core/`, and how autolinking finds the
native module). One render function in `core/` returns a descriptor and every adapter only turns it into
its own element.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --linear-gradient
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --linear-gradient
```

Either way: installs `@symbiote-native/linear-gradient` and wires the native autolinking automatically,
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/linear-gradient
```

Depends on `expo-linear-gradient` and `expo-modules-core` directly (regular dependencies, pinned to exact
versions, since this package's `core/` is hand-ported against one specific native API shape).
Never install `expo-linear-gradient` yourself, and never add the `expo` package to this project: it bundles
its own Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

`expo-linear-gradient`'s native code is discovered by `expo-modules-autolinking`, not by RN's own
`react-native.config.cjs` mechanism. Wire it into the native host app **once**, it covers this package
and every other `expo-modules-core` package with zero further changes. The steps and the
mechanics behind them are in the `symbiote-expo-native-module` skill and in
[`@symbiote-native/network`](../network)'s README; the reference app is `examples/expo-react`.

</details>

## Shape

```
src/core/                linear-gradient.ts - props, point normalization, the locations check and
                         renderLinearGradient (iOS: the native view is the root, Android: a View that
                         carries style and children over an absolute-fill native leaf).
src/react/               @symbiote-native/linear-gradient/react   - LinearGradient
src/vue/                 @symbiote-native/linear-gradient/vue     - LinearGradient
src/svelte/              @symbiote-native/linear-gradient/svelte  - LinearGradient (.svelte)
src/solid/               @symbiote-native/linear-gradient/solid   - LinearGradient
src/angular/linear-gradient/  @symbiote-native/linear-gradient/angular - LinearGradient
```

Angular cannot spell a dynamic tag name or project into a descriptor-built node, so it keeps one
component per platform (`index.ios.ts` / `index.android.ts`) with the same inputs.

## Use it

### React

```tsx
import { LinearGradient } from '@symbiote-native/linear-gradient/react';

<LinearGradient colors={['#4c669f', '#192f6a']} start={{ x: 0, y: 0 }} end={[1, 1]}>
  <Text>Over the gradient</Text>
</LinearGradient>;
```

### Vue

```vue
<script setup lang="ts">
import { LinearGradient } from '@symbiote-native/linear-gradient/vue';
</script>

<template>
  <LinearGradient :colors="['#4c669f', '#192f6a']" :end="[1, 1]">
    <text>Over the gradient</text>
  </LinearGradient>
</template>
```

### Angular

```ts
import { LinearGradient } from '@symbiote-native/linear-gradient/angular';

@Component({
  imports: [LinearGradient],
  template: `<LinearGradient [colors]="colors" [end]="[1, 1]"><text>Over the gradient</text></LinearGradient>`,
})
export class Card {
  readonly colors = ['#4c669f', '#192f6a'];
}
```

### Svelte

```svelte
<script lang="ts">
  import { LinearGradient } from '@symbiote-native/linear-gradient/svelte';
</script>

<LinearGradient colors={['#4c669f', '#192f6a']} end={[1, 1]}>
  <text>Over the gradient</text>
</LinearGradient>
```

### Solid

```tsx
import { LinearGradient } from '@symbiote-native/linear-gradient/solid';

<LinearGradient colors={['#4c669f', '#192f6a']} end={[1, 1]}>
  <text>Over the gradient</text>
</LinearGradient>;
```

## API

```ts
<LinearGradient
  colors={[ColorValue, ColorValue, ...ColorValue[]]}  // two or more, one color is style.backgroundColor
  locations?={number[]}                                // 0..1 ascending, same length as colors
  start?={{ x, y } | [x, y]}                           // default { x: 0.5, y: 0 }
  end?={{ x, y } | [x, y]}                             // default { x: 0.5, y: 1 }
  dither?={boolean}                                    // Android only, default true
  style? testID? nativeID? onLayout? ...View accessibility and responder props
/>
```

Plus `ILinearGradientProps` and `ILinearGradientPoint`, hand-ported from upstream's `LinearGradient.tsx`.
Children come through the framework's own mechanism (`children`, default slot, snippet,
`<ng-content>`).

## Notes

- **Children go inside the gradient.** It paints behind them. On iOS the native gradient is the root
  view. On Android the root is a plain `View` that carries your `style`, with the native gradient
  filling it as a child, so `children`, `onLayout` and touches behave as on any `View`.
- **Rounded corners go in `style`.** `borderRadius` and the four per-corner radii are read from
  `style` and handed to the native gradient, because React Native does not clip a native view by a
  radius on its own.
- **A bad value warns instead of throwing.** A `start` or `end` that is not `[x, y]` or `{ x, y }` is
  ignored, and a `locations` array of the wrong length is cut to the number of `colors`. Both log a
  warning and the gradient still draws.
- **`colors` takes anything `style` colors take.** Names, hex, `rgb()`/`rgba()` and `hsl()` all go
  through the same color processing as every other view.
- **Where the native view is missing, you get a plain `View`.** The package logs
  `LinearGradient is not available on this platform` and renders your children without a gradient.
- **Not ported.** The web variant (`LinearGradient.web.tsx`) and `NativeLinearGradient` re-export: native only.

## Common questions

- **`transparent` to a color looks gray on iOS.** Apple platforms fade `transparent` as transparent
  black. Fade to the same color with alpha 0 instead: `['rgba(255, 255, 255, 0)', '#ffffff']`.
- **Different on iOS and Android.** Do not give `start` and `end` the same point, that case is
  reported to render differently. Use distinct points, such as `[0, 0]` and `[1, 1]`.
- **Rounded corners.** Put `borderRadius` (or the four per-corner radii) in `style`. Android passes
  the radii to the native gradient by hand.
- **Gradient text.** Needs `@react-native-masked-view/masked-view`, a third-party React component,
  so React adapter only. No masked view ships for Vue, Svelte, Solid or Angular.
- **Animating colors.** `colors` is a plain prop, so drive it from state, a signal or a rune. For a
  smooth fade, stack two gradients and animate the `opacity` of the top one.
- **Slow in a long list.** Draw one gradient behind the list instead of one per row, and try
  `dither={false}` on Android.
- **One color.** `colors` needs two entries, use `style.backgroundColor` for one.

Sources: [Expo docs: LinearGradient](https://docs.expo.dev/versions/latest/sdk/linear-gradient/),
[expo/expo#7418](https://github.com/expo/expo/issues/7418),
[expo/expo#25595](https://github.com/expo/expo/issues/25595),
[expo/expo#32934](https://github.com/expo/expo/issues/32934),
[expo/expo#29408](https://github.com/expo/expo/issues/29408),
[expo/expo#23861](https://github.com/expo/expo/issues/23861).

## Test it

No device is needed for the logic. The core tests (`src/core/*.test.ts`) replace `expo-modules-core`
(`requireNativeViewManager`, `Platform`) and assert the descriptor a render function returns. The
adapter tests (`src/{react,vue,solid,angular}/**/*.test.*`, `vitest`) render the real component over the
recording Fabric with an injected view config and assert the committed payload, and Svelte's
`*.smoke.test.ts` compile the `.svelte` files and mount them. Painting itself is verified on a device in
the six `examples/expo-*` canary apps (`examples/expo-react`, `examples/expo-vue-sfc`,
`examples/expo-vue-tsx`, `examples/expo-svelte`, `examples/expo-solid`, `examples/expo-angular`), see the
parent [README](../../README.md).
