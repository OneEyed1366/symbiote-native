# @symbiote-native/asset

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-asset`](https://github.com/expo/expo/tree/main/packages/expo-asset) usable from **every**
adapter — React, Vue, Svelte, Solid, and Angular. Resolves a `require()` module id or a plain URI
to an `Asset` instance and downloads it to a local cache file. Built primarily so
[`@symbiote-native/font`](../font) can support the same `number`/`Asset` font-source forms as
upstream `expo-font` — usable standalone too.

Built the same way as [`@symbiote-native/network`](../network), an `expo-modules-core`-based
wrapper (see the `symbiote-expo-native-module` project skill for the full mechanism).

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --asset
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --asset
```

Either way: installs `@symbiote-native/asset` and wires the native autolinking automatically —
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI — installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/asset
```

`expo-asset`, `expo-modules-core`, `expo-constants`, and `@react-native/assets-registry` come
along as regular dependencies, pinned to exact versions — never install `expo-asset` yourself, and
never add the `expo` meta-package to this project.

### Required one-time step: native autolinking wiring

Same one-time step as every other `expo-modules-core` package this project ships — see
[`@symbiote-native/network`'s README](../network/README.md#required-one-time-step-native-autolinking-wiring)
and the `symbiote-expo-native-module` project skill. `native-link.json` registers one Android
module (`AssetModule` → `ExpoAsset`); iOS needs no manifest entry, it autolinks via
`use_expo_modules!`.

No platform permission string is needed — asset resolution and caching reads no protected system
state on either platform.

</details>

## Shape

```
src/core/               asset.ts — the Asset class (fromModule/fromMetadata/fromURI/loadAsync/
                        downloadAsync). asset-sources.ts — selectAssetSource/resolveUri (scale
                        pick, manifest2 dev-server resolution). asset-uris.ts —
                        getFilename/getFileExtension/getManifestBaseUrl. local-assets.ts —
                        getLocalAssetUri (Expo Go / expo-updates embedded assets).
                        platform-utils.ts — IS_ENV_WITH_LOCAL_ASSETS + the manifest/Constants
                        reads. asset-fx.ts — registers the Image custom source transformer as a
                        module-load side effect. native-module.ts resolves ExpoAsset through
                        expo-modules-core's requireNativeModule.
src/react/hooks/        @symbiote-native/asset/react   — useAssets
src/vue/composables/    @symbiote-native/asset/vue     — useAssets (same name)
src/svelte/runes/       @symbiote-native/asset/svelte  — useAssets (same name)
src/solid/primitives/   @symbiote-native/asset/solid   — createAssets (Solid reserves `use*` for
                        consuming existing state)
src/angular/services/   @symbiote-native/asset/angular — AssetsService (`.connect()` returns a
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
// Solid — the accessor is CALLED; a Solid component body runs once.
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

Plus `AssetDescriptor`, `AssetMetadata`, `AssetSource` — hand-ported from upstream's `Asset.ts`/
`AssetSources.ts`. `useAssets`/`createAssets` accept `number | number[]` only, matching upstream's
own `AssetHooks.ts` (narrower than `Asset.loadAsync`'s own `string`/`string[]` forms).

## Full parity — Expo Go / expo-updates code paths included

Every native-side upstream module is ported, including the Expo Go / classic-updates /
`expo-updates` branches (`getLocalAssetUri` reading `ExpoUpdates.localAssets`, `AssetSources.ts`'s
manifest2 dev-server resolution, `Asset.fx.ts`'s custom `Image` source-transformer registration).
This repo ships neither Expo Go nor `expo-updates`, so `IS_ENV_WITH_LOCAL_ASSETS` is always `false`
in practice and those branches sit naturally inert — real, tested code (see
`platform-utils.test.ts`, `asset-fx.test.ts`, `local-assets.test.ts`), not stubs. If a consuming
app ever installs `expo-updates` itself, this package picks it up automatically, same as upstream.

## Not ported

- **The web platform** — no `ImageAssets`/browser `Image()` probing; only the native path is
  ported (same convention as every other package in this repo — see the root `CLAUDE.md`).

## Test it

No Fabric/Descriptor angle at all — every function here is a pure async-function surface over the
`Asset` class, never a view. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/{asset,asset-sources,asset-uris,local-assets,
platform-utils,asset-fx}.test.ts`, `src/{react,vue,svelte,solid,angular}/**/*.test.{ts,tsx}`) — no
`installFabric()`, no ViewConfig.

**Known gap:** unlike every other shipped `@symbiote-native/*` package, this one has no canary demo
screen yet in any of the 6 `examples/expo-*` apps — see the `symbiote-expo-package-catalog` skill.
