# @symbiote-native/image

[`expo-image`](https://docs.expo.dev/versions/latest/sdk/image/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. An image view
with caching, placeholders, transitions and SF Symbols, plus the cache and hash functions.

## Install

```bash
npx @symbiote-native/cli new my-app --image   # new app
npx @symbiote-native/cli add --image          # existing app
```

Manual: `npm install @symbiote-native/image`, then wire `expo-modules-autolinking` once per app.
Never install `expo-image` or the `expo` meta-package yourself.

## Usage

```tsx
import { Image, useImage } from '@symbiote-native/image/react';

<Image
  source="https://picsum.photos/400"
  placeholder="blurhash:/L6PZfSi_.AyE_3t7t7R**0o#DgR4"
  contentFit="cover"
  transition={200}
  style={{ width: 200, height: 200 }}
/>;
```

The view takes the props of upstream's `Image`. The handle has `startAnimating`, `stopAnimating`,
`lockResourceAsync`, `unlockResourceAsync` and `reloadAsync`, reached by a `ref` in React and Solid
(`ref={fn}`), a template ref in Vue, `bind:this` in Svelte and a `@ViewChild` in Angular.

`ImageBackground` is a view with an image filling it. `useImage` (`injectImage` in Angular) loads
a native `ImageRef` and releases it with its owner. The static functions of upstream's `Image` are
plain functions: `prefetchImages`, `clearMemoryCache`, `clearDiskCache`, `getCachePathAsync`,
`writeToCacheAsync`, `readFromCacheAsync`, `configureCache`, `generateBlurhashAsync`,
`generateThumbhashAsync`, `loadImageAsync`.

Angular selectors are `ExpoImage` and `ExpoImageBackground`, `Image` and `ImageBackground` are
tags of the adapter.

## Not ported

The web build, upstream's RSC snapshot tests and the `expo-observe` integration.
