# @symbiote-native/asset

Turn `require('./logo.png')` (or a plain URI) into a local file: download it once, read
`localUri`, reuse it. One API for every [SymbioteNative](../../README.md) adapter (React, Vue,
Svelte, Solid and Angular).

It wraps [`expo-asset`](https://github.com/expo/expo/tree/main/packages/expo-asset): an `Asset`
instance resolved from a `require()` module id or URI, downloaded to a cache file. Built mainly so
[`@symbiote-native/font`](../font) can accept the same `number`/`Asset` font-source forms as
upstream `expo-font`; usable standalone too. Same recipe as
[`@symbiote-native/network`](../network), an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism).

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --asset
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --asset
```

Either way: installs `@symbiote-native/asset` and wires the native autolinking automatically -
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/asset
```

`expo-asset`, `expo-modules-core`, `expo-constants`, and `@react-native/assets-registry` come
along as regular dependencies, pinned to exact versions - never install `expo-asset` yourself, and
never add the `expo` meta-package to this project.

### Required one-time step: native autolinking wiring

Same one-time step as every other `expo-modules-core` package this project ships - see
[`@symbiote-native/network`'s README](../network/README.md#required-one-time-step-native-autolinking-wiring)
and the `symbiote-expo-native-module` project skill. `native-link.json` registers one Android
module (`AssetModule` → `ExpoAsset`); iOS needs no manifest entry, it autolinks via
`use_expo_modules!`.

No platform permission string is needed - asset resolution and caching reads no protected system
state on either platform.

</details>

## Shape

```
src/core/               asset.ts - the Asset class (fromModule/fromMetadata/fromURI/loadAsync/
                        downloadAsync). asset-sources.ts - selectAssetSource/resolveUri (scale
                        pick, manifest2 dev-server resolution). asset-uris.ts -
                        getFilename/getFileExtension/getManifestBaseUrl. local-assets.ts -
                        getLocalAssetUri (Expo Go / expo-updates embedded assets).
                        platform-utils.ts - IS_ENV_WITH_LOCAL_ASSETS + the manifest/Constants
                        reads. asset-fx.ts - registers the Image custom source transformer as a
                        module-load side effect. native-module.ts resolves ExpoAsset through
                        expo-modules-core's requireNativeModule.
src/react/hooks/        @symbiote-native/asset/react   - useAssets
src/vue/composables/    @symbiote-native/asset/vue     - useAssets (same name)
src/svelte/runes/       @symbiote-native/asset/svelte  - useAssets (same name)
src/solid/primitives/   @symbiote-native/asset/solid   - createAssets (Solid reserves `use*` for
                        consuming existing state)
src/angular/services/   @symbiote-native/asset/angular - AssetsService (`.connect()` returns a
                        Signal pair)
```

Each adapter's hook/composable/rune/primitive/service is a thin lifecycle wrapper over
`Asset.loadAsync`, matching upstream's own `useAssets` hook contract (loads once on mount).

## Use it

```tsx
// React
import { useAssets } from '@symbiote-native/asset/react';

function Logo() {
  const [assets, error] = useAssets(require('./assets/logo.png'));
  return assets ? <image source={{ uri: assets[0].localUri ?? undefined }} /> : null;
}
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { useAssets } from '@symbiote-native/asset/vue';

const { assets, error } = useAssets(require('./assets/logo.png'));
</script>
<template>
  <image v-if="assets" :source="{ uri: assets[0].localUri ?? undefined }" />
</template>
```

```svelte
<!-- Svelte -->
<script lang="ts">
  import { useAssets } from '@symbiote-native/asset/svelte';

  const { assets, error } = useAssets(require('./assets/logo.png'));
</script>

{#if assets}
  <image source={{ uri: assets[0].localUri ?? undefined }} />
{/if}
```

```ts
// Angular
import { Component, inject } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { AssetsService } from '@symbiote-native/asset/angular';

@Component({
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `@if (assets.assets(); as loaded) {
    <image [source]="{ uri: loaded[0].localUri ?? undefined }" />
  }`,
})
export class Logo {
  readonly assets = inject(AssetsService).connect(require('./assets/logo.png'));
}
```

```tsx
// Solid - the accessor is CALLED; a Solid component body runs once.
import { createAssets } from '@symbiote-native/asset/solid';

function Logo() {
  const { assets } = createAssets(require('./assets/logo.png'));
  const loaded = () => assets()?.[0];
  return loaded() ? (
    <image source={{ uri: loaded()!.localUri ?? undefined }} />
  ) : null;
}
```

## API

```ts
Asset.fromModule(virtualAssetModule: number | string | { uri: string; width: number; height: number }): Asset
Asset.fromMetadata(meta: AssetMetadata): Asset
Asset.fromURI(uri: string): Asset
Asset.loadAsync(moduleId: number | number[] | string | string[]): Promise<Asset[]>
asset.downloadAsync(): Promise<Asset>
```

Plus `AssetDescriptor`, `AssetMetadata`, `AssetSource` - hand-ported from upstream's `Asset.ts`/
`AssetSources.ts`. `useAssets`/`createAssets` accept `number | number[]` only, matching upstream's
own `AssetHooks.ts` (narrower than `Asset.loadAsync`'s own `string`/`string[]` forms).

## Full parity - Expo Go / expo-updates code paths included

Every native-side upstream module is ported, including the Expo Go / classic-updates /
`expo-updates` branches (`getLocalAssetUri` reading `ExpoUpdates.localAssets`, `AssetSources.ts`'s
manifest2 dev-server resolution, `Asset.fx.ts`'s custom `Image` source-transformer registration).
This repo ships neither Expo Go nor `expo-updates`, so `IS_ENV_WITH_LOCAL_ASSETS` is always `false`
in practice and those branches sit naturally inert - real, tested code (see
`platform-utils.test.ts`, `asset-fx.test.ts`, `local-assets.test.ts`), not stubs. If a consuming
app ever installs `expo-updates` itself, this package picks it up automatically, same as upstream.

## Not ported

- **The `expo-asset` config plugin.** It links files into the native project from `app.json`; this
  repo runs no Expo prebuild step. Bundle files with `require()` through Metro and add unusual
  extensions to `assetExts` in the Metro config.
- **The web platform** - no `ImageAssets`/browser `Image()` probing; only the native path is
  ported (same convention as every other package in this repo - see the root `CLAUDE.md`).

## Common questions

- **`localUri` is `null`.** It is `null` until the asset is downloaded: read it after
  `Asset.loadAsync` or `downloadAsync` resolves.
- **Preload several assets.** `await Asset.loadAsync([require('./a.png'), require('./b.png')])`.
- **Where does the file go?** The app's cache directory; the OS may remove it later.
- **Does the hook reload for a new module id?** No, it loads once on mount, like upstream.

Sources: [Expo docs: Asset](https://docs.expo.dev/versions/latest/sdk/asset/),
[expo/expo#8222](https://github.com/expo/expo/pull/8222).

## Test it

No Fabric/Descriptor angle at all - every function here is a pure async-function surface over the
`Asset` class, never a view. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/{asset,asset-sources,asset-uris,local-assets,
platform-utils,asset-fx}.test.ts`, `src/{react,vue,svelte,solid,angular}/**/*.test.{ts,tsx}`) - no
`installFabric()`, no ViewConfig.

The `AssetScreen` in the `examples/expo-*` apps carries the on-device verification.
