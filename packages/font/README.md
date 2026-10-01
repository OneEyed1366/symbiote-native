# @symbiote-native/font

Use a custom font without touching the native projects: give a name and a font file, wait for the
load, then reference the name in `fontFamily`. One API for every [SymbioteNative](../../README.md)
adapter (React, Vue, Svelte, Solid and Angular).

It wraps [`expo-font`](https://github.com/expo/expo/tree/main/packages/expo-font). A font source is
a string, URI, `require()` module id, or an [`@symbiote-native/asset`](../asset) `Asset`. The
`renderToImageAsync` text-to-image utility (iOS + Android) comes with it. Built the same way as
[`@symbiote-native/network`](../network), an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism).

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --font
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --font
```

Either way: installs `@symbiote-native/font` and wires the native autolinking automatically - see
[`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/font
```

`expo-font`, `expo-modules-core`, and `@symbiote-native/asset` come along as regular dependencies,
pinned to exact versions - never install `expo-font` yourself, and never add the `expo` meta-package
to this project.

### Required one-time step: native autolinking wiring

Same one-time step as every other `expo-modules-core` package this project ships - see
[`@symbiote-native/network`'s README](../network/README.md#required-one-time-step-native-autolinking-wiring)
and the `symbiote-expo-native-module` project skill. `native-link.json` registers two Android
modules (`FontLoaderModule` → `ExpoFontLoader`, `FontUtilsModule` → `ExpoFontUtils`); iOS needs no
manifest entry, both autolink via `use_expo_modules!`.

No platform permission string is needed - font loading/rendering reads no protected system state
on either platform.

</details>

## Shape

```
src/core/               font.ts - isLoaded/getLoadedFonts/isLoading/isFontMapLoaded/loadAsync/
                        unloadAllAsync/unloadAsync. font-loader.ts resolves a FontSource to an
                        @symbiote-native/asset Asset. font-utils.ts - renderToImageAsync.
                        memory.ts - the loaded-fonts cache. native-modules.ts resolves
                        ExpoFontLoader/ExpoFontUtils through expo-modules-core's
                        requireNativeModule/requireOptionalNativeModule.
src/react/hooks/        @symbiote-native/font/react   - useFonts
src/vue/composables/    @symbiote-native/font/vue     - useFonts (same name)
src/svelte/runes/       @symbiote-native/font/svelte  - useFonts (same name)
src/solid/primitives/   @symbiote-native/font/solid   - createFonts (Solid reserves `use*` for
                        consuming existing state)
src/angular/services/   @symbiote-native/font/angular - FontsService (`.connect()` returns a
                        Signal pair)
```

Each adapter's hook/composable/rune/primitive/service is a thin lifecycle wrapper (seed
synchronously from `isFontMapLoaded`, call `loadAsync` once on mount, never reload on a changed
font map) over the same `core` functions.

## Use it

```tsx
// React
import { loadAsync } from '@symbiote-native/font';
import { useFonts } from '@symbiote-native/font/react';

function App() {
  const [loaded, error] = useFonts({
    'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'),
  });

  if (!loaded) return null;
  return <text style={{ fontFamily: 'Inter-Regular' }}>Hello</text>;
}
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { useFonts } from '@symbiote-native/font/vue';

const { loaded, error } = useFonts({
  'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'),
});
</script>
<template>
  <text v-if="loaded" style="font-family: Inter-Regular">Hello</text>
</template>
```

```svelte
<!-- Svelte -->
<script lang="ts">
  import { useFonts } from '@symbiote-native/font/svelte';

  const fonts = useFonts({
    'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'),
  });
</script>

{#if fonts.loaded}
  <text style="font-family: Inter-Regular">Hello</text>
{/if}
```

```ts
// Angular
import { Component, inject } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { FontsService } from '@symbiote-native/font/angular';

@Component({
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `@if (fonts.loaded()) {
    <text style="font-family: Inter-Regular">Hello</text>
  }`,
})
export class App {
  readonly fonts = inject(FontsService).connect({
    'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'),
  });
}
```

```tsx
// Solid - the accessor is CALLED; a Solid component body runs once.
import { createFonts } from '@symbiote-native/font/solid';

function App() {
  const fonts = createFonts({
    'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'),
  });

  return fonts.loaded() ? (
    <text style={{ 'font-family': 'Inter-Regular' }}>Hello</text>
  ) : null;
}
```

## API

```ts
isLoaded(fontFamily: string): boolean
getLoadedFonts(): string[]
isLoading(fontFamily: string): boolean
isFontMapLoaded(map: string | Record<string, FontSource>): boolean
loadAsync(fontFamilyOrFontMap: string | Record<string, FontSource>, source?: FontSource): Promise<void>
unloadAllAsync(): Promise<void>                                    // always throws - see Notes
unloadAsync(fontFamilyOrFontMap: string | Record<string, UnloadFontOptions>, options?: UnloadFontOptions): Promise<void>  // always throws - see Notes
renderToImageAsync(glyphs: string, options?: IRenderToImageOptions): Promise<IRenderToImageResult>
```

Plus `FontDisplay` (enum, web-only effect, kept for type parity), `FontSource`, `FontResource`,
`UnloadFontOptions`, `UseFontsResult` - hand-ported from upstream's `Font.types.ts`.

## Notes

- **The `fontFamily` in a style must match the map key exactly.** `'Inter-Regular'` in the map and
  `fontFamily: 'Inter'` in the style silently falls back to the system font.
- **`unloadAsync`/`unloadAllAsync` always throw `UnavailabilityError` on native** - ported and
  exported for API parity, but `ExpoFontLoader` has no unload method on either iOS or Android,
  only on web. Matches upstream exactly; not a bug in this port.
- **The web/server branches are not ported** - `isLoaded`'s web fallback, `loadAsync`'s server
  pre-render pass (`registerStaticFont`/`serverContext`), `FontHooks.ts`'s static-fonts SSR branch.
  This repo has no web/SSR render target for any adapter.
- **`expo-font`'s config plugin (`withFonts`) is not ported** - declaratively bundles static font
  files into the native project via `app.json`. This repo runs no Expo CLI/prebuild step at all
  (see the root `CLAUDE.md`); bundle a static font the plain React Native way
  (`android/app/src/main/assets/fonts/`, Xcode's "Copy Bundle Resources" + `UIAppFonts` in
  `Info.plist`) or call `loadAsync` with a local `file://` URI at startup.

## Common questions

- **The text uses the system font.** The `fontFamily` is not the exact key you loaded, you rendered
  before `loaded`, or the file failed to load (check `error` and `getLoadedFonts()`).
- **Bold or italic.** Load each weight or style as its own family and set `fontFamily` to it; do
  not rely on `fontWeight` for a custom family.
- **A natively bundled font works on Android, not iOS.** iOS finds a `UIAppFonts` font by its own
  (full or PostScript) name, not the file name; a runtime-loaded font uses your map key.
- **Unloading.** `unloadAsync` throws on iOS and Android: the native loader has no unload.

Sources: [expo/expo#33673](https://github.com/expo/expo/issues/33673),
[expo/expo#22074](https://github.com/expo/expo/issues/22074),
[DEV: custom fonts on iOS](https://dev.to/aymericmartinache/the-mystery-of-fonts-on-ios-why-was-my-app-not-displaying-custom-fonts-3h8j).

## Test it

No Fabric/Descriptor angle at all - every function here is a pure async-function surface plus a
small in-memory cache, never a view. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/{font,font-loader,font-utils,memory}.test.ts`,
`src/{react,vue,svelte,solid,angular}/**/*.test.{ts,tsx}`) - no `installFabric()`, no ViewConfig.

The `FontScreen` in the `examples/expo-*` apps carries the on-device verification.
