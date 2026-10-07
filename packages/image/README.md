# @symbiote-native/image

[`expo-image`](https://docs.expo.dev/versions/latest/sdk/image/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. An image view
with caching, placeholders, transitions and SF Symbols, plus the cache and hash functions.

Built the same way as [`@symbiote-native/clipboard`](../clipboard)'s `ClipboardPasteButton`, an
`expo-modules-core` native view reached through `requireNativeViewManager` (see the
`symbiote-expo-native-module` project skill: why `expo-modules-core` is depended on directly and never
the `expo` meta-package, why the upstream JS is hand-ported into `core/`, and how autolinking finds the
native module). One render function in `core/` returns a descriptor and every adapter only turns it into
its own element.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --image
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --image
```

Either way: installs `@symbiote-native/image` and wires the native autolinking automatically,
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/image
```

Depends on `expo-image` and `expo-modules-core` directly (regular dependencies, pinned to exact
versions, since this package's `core/` is hand-ported against one specific native API shape).
Never install `expo-image` yourself, and never add the `expo` package to this project: it bundles
its own Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

`expo-image`'s native code is discovered by `expo-modules-autolinking`, not by RN's own
`react-native.config.cjs` mechanism. Wire it into the native host app **once**, it covers this package
and every other `expo-modules-core` package with zero further changes. The steps and the
mechanics behind them are in the `symbiote-expo-native-module` skill and in
[`@symbiote-native/network`](../network)'s README; the reference app is `examples/expo-react`.

### Android KSP

`expo-image` reads a `kspVersion` from the app's root `build.gradle`. `native-link.json` declares
`android.requiresKsp`, so the `expo-modules-link` postinstall writes the right version there from Expo's
table for the app's Kotlin version.

</details>

## Shape

```
src/core/                image-view.ts - createImageView(getNode): render, the view handle and the events.
                         props.ts (normalization, deprecation warnings), sources.ts, native-style.ts,
                         image-background.ts, image-api.ts (the statics as functions), image-loader.ts and
                         image-ref-loader.ts (useImage's core), hash-strings.ts, types.ts.
src/react/               @symbiote-native/image/react   - Image, ImageBackground, useImage
src/vue/                 @symbiote-native/image/vue     - Image, ImageBackground, useImage (a shallow ref)
src/svelte/              @symbiote-native/image/svelte  - Image, ImageBackground, useImage ({ current })
src/solid/               @symbiote-native/image/solid   - Image, ImageBackground, useImage (an accessor)
src/angular/             @symbiote-native/image/angular - ExpoImage, ExpoImageBackground, injectImage (a signal)
```

Angular's selectors are `ExpoImage` and `ExpoImageBackground` because `Image` and `ImageBackground` are
already tags of the adapter.

## Use it

### React

```tsx
import { Image, useImage } from '@symbiote-native/image/react';

const image = useImage('https://picsum.photos/1000/800', { maxWidth: 800 });

<Image
  source="https://picsum.photos/400"
  placeholder="blurhash:/L6PZfSi_.AyE_3t7t7R**0o#DgR4"
  contentFit="cover"
  transition={200}
  style={{ width: 200, height: 200 }}
/>;
{image && <Image source={image} style={{ width: 200, height: 160 }} />}
```

### Vue

```vue
<script setup lang="ts">
import { Image, useImage } from '@symbiote-native/image/vue';

const image = useImage('https://picsum.photos/1000/800', { maxWidth: 800 });
</script>

<template>
  <Image
    source="https://picsum.photos/400"
    placeholder="blurhash:/L6PZfSi_.AyE_3t7t7R**0o#DgR4"
    contentFit="cover"
    :transition="200"
    :style="{ width: 200, height: 200 }"
  />
  <Image v-if="image" :source="image" :style="{ width: 200, height: 160 }" />
</template>
```

`image` is a shallow ref, so a template reads it unwrapped and a script reads `image.value`.

### Angular

```ts
import { Component } from '@angular/core';
import { ExpoImage, injectImage } from '@symbiote-native/image/angular';

@Component({
  standalone: true,
  imports: [ExpoImage],
  template: `
    <ExpoImage
      source="https://picsum.photos/400"
      placeholder="blurhash:/L6PZfSi_.AyE_3t7t7R**0o#DgR4"
      contentFit="cover"
      [transition]="200"
      [style]="{ width: 200, height: 200 }"
    />
    @if (image(); as ref) {
      <ExpoImage [source]="ref" [style]="{ width: 200, height: 160 }" />
    }
  `,
})
export class Photo {
  readonly image = injectImage(() => 'https://picsum.photos/1000/800', () => ({ maxWidth: 800 }));
}
```

The selector is `ExpoImage`, because `Image` is already a tag of the adapter. `image` is a signal.

### Svelte

```svelte
<script lang="ts">
  import { Image, useImage } from '@symbiote-native/image/svelte';

  const image = useImage(() => 'https://picsum.photos/1000/800', () => ({ maxWidth: 800 }));
</script>

<Image
  source="https://picsum.photos/400"
  placeholder="blurhash:/L6PZfSi_.AyE_3t7t7R**0o#DgR4"
  contentFit="cover"
  transition={200}
  style={{ width: 200, height: 200 }}
/>
{#if image.current}
  <Image source={image.current} style={{ width: 200, height: 160 }} />
{/if}
```

### Solid

```tsx
import { Show } from 'solid-js';
import { Image, useImage } from '@symbiote-native/image/solid';

const image = useImage(() => 'https://picsum.photos/1000/800', () => ({ maxWidth: 800 }));

<Image
  source="https://picsum.photos/400"
  placeholder="blurhash:/L6PZfSi_.AyE_3t7t7R**0o#DgR4"
  contentFit="cover"
  transition={200}
  style={{ width: 200, height: 200 }}
/>;
<Show when={image()}>{ref => <Image source={ref()} style={{ width: 200, height: 160 }} />}</Show>;
```

## API

```ts
<Image source placeholder? contentFit? contentPosition? transition? cachePolicy? recyclingKey? priority?
       tintColor? allowDownscaling? autoplay? alt? onLoadStart? onProgress? onLoad? onError? onDisplay? />
<ImageBackground imageStyle? ...Image props>children paint over the image</ImageBackground>

useImage(source, options?, dependencies?): ImageRef | null          // per adapter, see Shape
// view handle: startAnimating, stopAnimating, lockResourceAsync, unlockResourceAsync, reloadAsync

prefetchImages(urls: string | string[], options?: CachePolicy | { cachePolicy?, headers? }): Promise<boolean>
clearMemoryCache(): Promise<boolean>      clearDiskCache(): Promise<boolean>     // true on success
getCachePathAsync(cacheKey): Promise<string | null>                              // null when not cached
writeToCacheAsync(source: string | ImageRef, cacheKey): Promise<void>
readFromCacheAsync(cacheKey): Promise<ImageRef | null>
configureCache(config): void
loadImageAsync(source, options?): Promise<ImageRef>
generateBlurhashAsync(source: string | ImageRef, numberOfComponents: [number, number] | { width, height }): Promise<string | null>
generateThumbhashAsync(source: string | ImageRef): Promise<string>
```

The statics of upstream's `Image` class are plain functions here. Ported from upstream's `Image.tsx`,
`ImageBackground.tsx` and `useImage.ts`.

## Notes

- **It is not React Native's `Image`.** The default fit is `contentFit="cover"`. The old `resizeMode`,
  `fadeDuration` and `defaultSource` props still work but log a warning once, and `resizeMode:
  'repeat'` is not supported at all. Use `contentFit`, `transition` and `placeholder`.
- **Caching is on by default.** `cachePolicy` is `disk`. `memory` and `memory-disk` keep decoded
  images in RAM, which the system purges quickly under pressure.
- **A new source keeps the old picture until the new one loads**, and `transition` blends them. That
  is the point of the library, and it is why recycling lists need `recyclingKey`.
- **`require('./a.png')` works.** Asset numbers go through Metro's asset registry before reaching
  native, the same as for any image view.
- **SVG is decoded by the system on iOS.** An elliptical arc command with more than one parameter
  set and packed flags can draw distorted or not at all. Simplify the path if one looks wrong.
- **Colors go through `processColor` by hand**, so `tintColor` and the style colors accept names,
  hex and `rgb()`.
- **Not ported.** The web build, the RSC render tests of upstream (snapshot tests of a server renderer) and the `expo-observe` integration.
- **Not ported.** The web build, upstream's RSC snapshot tests and the `expo-observe` integration.

## Common questions

- **A list shows the previous row's picture.** The view keeps the old image until the new one is
  ready. Give each image a `recyclingKey` (the item id). A `key` instead destroys the view and
  defeats recycling.
- **Memory climbs with many images.** Show thumbnails sized to the box, keep `cachePolicy="disk"`,
  leave `allowDownscaling` on, use `useImage` with `maxWidth`, call `clearMemoryCache()` on memory
  pressure.
- **Animated WebP freezes or is slow on iOS.** Apple's decoder is slow on some files. Test or
  re-encode them, and control playback with `autoplay={false}` and `startAnimating()`.
- **Android `NoSuchMethodError`.** `expo-image` and `expo-modules-core` must come from matching
  releases. This package pins both, never install either yourself.
- **The placeholder flickers.** Set `placeholderContentFit` to the same value as `contentFit`.
- **`resizeMode`, `fadeDuration`, `defaultSource`.** Still work, warn once, `repeat` is unsupported.
  Use `contentFit`, `transition`, `placeholder`.
- **Angular names.** `ExpoImage` and `ExpoImageBackground`.

Sources: [Expo docs: Image](https://docs.expo.dev/versions/latest/sdk/image/),
[expo/expo#21211](https://github.com/expo/expo/issues/21211),
[expo/expo#26781](https://github.com/expo/expo/issues/26781),
[expo/expo#24557](https://github.com/expo/expo/issues/24557),
[expo/expo#25920](https://github.com/expo/expo/issues/25920),
[expo/expo#37229](https://github.com/expo/expo/issues/37229).

## Test it

No device is needed for the logic. The core tests (`src/core/*.test.ts`) replace `expo-modules-core`
(`requireNativeViewManager`, `Platform`) and assert the descriptor a render function returns. The
adapter tests (`src/{react,vue,solid,angular}/**/*.test.*`, `vitest`) render the real component over the
recording Fabric with an injected view config and assert the committed payload, and Svelte's
`*.smoke.test.ts` compile the `.svelte` files and mount them. Painting itself is verified on a device in
the six `examples/expo-*` canary apps (`examples/expo-react`, `examples/expo-vue-sfc`,
`examples/expo-vue-tsx`, `examples/expo-svelte`, `examples/expo-solid`, `examples/expo-angular`), see the
parent [README](../../README.md).
