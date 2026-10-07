# @symbiote-native/symbols

[`expo-symbols`](https://docs.expo.dev/versions/latest/sdk/symbols/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. SF Symbols on iOS,
Material Symbols on Android drawn from a font loaded through `@symbiote-native/font`.

Built the same way as [`@symbiote-native/clipboard`](../clipboard)'s `ClipboardPasteButton`, an
`expo-modules-core` native view reached through `requireNativeViewManager` (see the
`symbiote-expo-native-module` project skill: why `expo-modules-core` is depended on directly and never
the `expo` meta-package, why the upstream JS is hand-ported into `core/`, and how autolinking finds the
native module). One render function in `core/` returns a descriptor and every adapter only turns it into
its own element. On Android the glyph comes from a font loaded through
[`@symbiote-native/font`](../font).

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --symbols
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --symbols
```

Either way: installs `@symbiote-native/symbols` and wires the native autolinking automatically,
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/symbols
```

Depends on `expo-symbols` and `expo-modules-core` directly (regular dependencies, pinned to exact
versions, since this package's `core/` is hand-ported against one specific native API shape).
Never install `expo-symbols` yourself, and never add the `expo` package to this project: it bundles
its own Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

`expo-symbols`'s native code is discovered by `expo-modules-autolinking`, not by RN's own
`react-native.config.cjs` mechanism. Wire it into the native host app **once**, it covers this package
and every other `expo-modules-core` package with zero further changes. The steps and the
mechanics behind them are in the `symbiote-expo-native-module` skill and in
[`@symbiote-native/network`](../network)'s README; the reference app is `examples/expo-react`.

</details>

## Shape

```
src/core/                symbols.ts - renderSymbolView (iOS: the native SymbolView, elsewhere a sized View
                         holding a Text in the Material Symbols font), loadSymbolFont, watchSymbolFont.
                         symbol-types.ts - props and the SF Symbols name types. android/ - the symbol
                         table and the seven weight files (`./androidWeights/*` subpath).
src/react/               @symbiote-native/symbols/react   - SymbolView
src/vue/                 @symbiote-native/symbols/vue     - SymbolView
src/svelte/              @symbiote-native/symbols/svelte  - SymbolView (.svelte)
src/solid/               @symbiote-native/symbols/solid   - SymbolView
src/angular/             @symbiote-native/symbols/angular - SymbolView
```

The descriptor changes shape when the font loads (an empty View, then a glyph), which Solid's bridge
forbids, so its component rebuilds the node per shape key.

## Use it

### React

```tsx
import { SymbolView } from '@symbiote-native/symbols/react';

<SymbolView
  name={{ ios: 'star.fill', android: 'star' }}
  tintColor="orange"
  size={32}
  fallback={<Text>star</Text>}
/>;
```

### Vue

```vue
<script setup lang="ts">
import { SymbolView } from '@symbiote-native/symbols/vue';
</script>

<template>
  <SymbolView :name="{ ios: 'star.fill', android: 'star' }" tint-color="orange" :size="32">
    <template #fallback><text>star</text></template>
  </SymbolView>
</template>
```

### Angular

```ts
import { SymbolView } from '@symbiote-native/symbols/angular';

@Component({
  imports: [SymbolView],
  template: `
    <SymbolView [name]="{ ios: 'star.fill', android: 'star' }" tintColor="orange" [size]="32">
      <text>star</text>
    </SymbolView>
  `,
})
export class Card {}
```

### Svelte

```svelte
<script lang="ts">
  import { SymbolView } from '@symbiote-native/symbols/svelte';
</script>

<SymbolView name={{ ios: 'star.fill', android: 'star' }} tintColor="orange" size={32}>
  {#snippet fallback()}<text>star</text>{/snippet}
</SymbolView>
```

### Solid

```tsx
import { SymbolView } from '@symbiote-native/symbols/solid';

<SymbolView
  name={{ ios: 'star.fill', android: 'star' }}
  tintColor="orange"
  size={32}
  fallback={<text>star</text>}
/>;
```

## API

```ts
<SymbolView
  name={SFSymbol | { ios?, android?, web? }}   // a platform with no entry renders `fallback`
  type?={'monochrome' | 'hierarchical' | 'palette' | 'multicolor'}   // iOS
  scale? weight? colors? tintColor? resizeMode? animationSpec?
  size?={number}                                // default 24
  fallback?                                     // prop, slot, snippet or projected content
  style? testID? nativeID? onLayout? ...View accessibility and responder props
/>

unstable_getMaterialSymbolSourceAsync(symbol, size, color):
  Promise<{ uri, width, height, scale } | null>      // null on iOS and for an unknown symbol
import bold from '@symbiote-native/symbols/androidWeights/bold'   // thin | extraLight | light |
                                                                    // regular | medium | semiBold | bold
```

Ported from upstream's `SymbolView.tsx` and `SymbolModule`. Upstream ships no tests, the suites here are
written against its behavior.

## Notes

- **`name` is per platform.** SF Symbols and Material Symbols use different names, so pass
  `{ ios: 'heart.fill', android: 'favorite' }`. A platform with no entry renders your `fallback`.
- **Android draws a glyph, not an image.** The view is an empty sized `View` until the font loads,
  then the glyph is a `Text` in the Material Symbols font. If loading fails it stays empty.
- **`size` sets width and height** (24 by default). On Android `style` goes to that wrapping `View`,
  so margins and backgrounds apply there too.
- **Only the weights you import are bundled on Android.** `regular` is the default, any other comes
  from the `androidWeights` subpath. Do not import weights you do not use.
- **`tintColor` goes through the same color processing as every other view**, so names, hex,
  `rgb()` and `rgba()` all work. On Android it is the text color, and the default is the system
  primary color.
- **Not ported.** The macOS entry (`SymbolView.macos.tsx`) and the web build. Upstream ships no tests, so the suites here are written against its behavior.

## Common questions

- **Blank on Android.** The Material Symbols font loads on mount, until then the view is an empty
  box. If it stays empty the font failed or the name is not a Material Symbol. Pass an `android`
  entry in `name` and render a `fallback`.
- **Stretched on iOS.** SF Symbols are not square. Set `resizeMode` instead of forcing width and
  height.
- **Filled and outline do not switch on Android.** The bundled fonts have no `FILL` axis, open
  upstream. Use two icons that differ in shape.
- **`rgb()` colors.** Work here, `tintColor` and `colors` go through the usual color processing.
- **Font size.** Only the weights you import from `androidWeights/*` are bundled.
- **Custom SF Symbols.** Not covered, the native view takes system symbol names.

Sources: [Expo docs: Symbols](https://docs.expo.dev/versions/latest/sdk/symbols/),
[expo/expo#29889](https://github.com/expo/expo/issues/29889),
[expo/expo#46850](https://github.com/expo/expo/issues/46850),
[expo/expo#36847](https://github.com/expo/expo/issues/36847),
[expo/expo#43614](https://github.com/expo/expo/issues/43614).

## Test it

No device is needed for the logic. The core tests (`src/core/*.test.ts`) replace `expo-modules-core`
(`requireNativeViewManager`, `Platform`) and assert the descriptor a render function returns. The
adapter tests (`src/{react,vue,solid,angular}/**/*.test.*`, `vitest`) render the real component over the
recording Fabric with an injected view config and assert the committed payload, and Svelte's
`*.smoke.test.ts` compile the `.svelte` files and mount them. Painting itself is verified on a device in
the six `examples/expo-*` canary apps (`examples/expo-react`, `examples/expo-vue-sfc`,
`examples/expo-vue-tsx`, `examples/expo-svelte`, `examples/expo-solid`, `examples/expo-angular`), see the
parent [README](../../README.md).
