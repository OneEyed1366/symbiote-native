# @symbiote-native/live-photo

[`expo-live-photo`](https://docs.expo.dev/versions/latest/sdk/live-photo/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. Shows a Live
Photo, iOS only.

Built the same way as [`@symbiote-native/clipboard`](../clipboard)'s `ClipboardPasteButton`, an
`expo-modules-core` native view reached through `requireNativeViewManager` (see the
`symbiote-expo-native-module` project skill: why `expo-modules-core` is depended on directly and never
the `expo` meta-package, why the upstream JS is hand-ported into `core/`, and how autolinking finds the
native module). One render function in `core/` returns a descriptor and every adapter only turns it into
its own element.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --live-photo
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --live-photo
```

Either way: installs `@symbiote-native/live-photo` and wires the native autolinking automatically,
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/live-photo
```

Depends on `expo-live-photo` and `expo-modules-core` directly (regular dependencies, pinned to exact
versions, since this package's `core/` is hand-ported against one specific native API shape).
Never install `expo-live-photo` yourself, and never add the `expo` package to this project: it bundles
its own Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

`expo-live-photo`'s native code is discovered by `expo-modules-autolinking`, not by RN's own
`react-native.config.cjs` mechanism. Wire it into the native host app **once**, it covers this package
and every other `expo-modules-core` package with zero further changes. The steps and the
mechanics behind them are in the `symbiote-expo-native-module` skill and in
[`@symbiote-native/network`](../network)'s README; the reference app is `examples/expo-react`.

</details>

## Shape

```
src/core/                live-photo-view.ts - createLivePhotoViewHandle(getNode) and the render function.
                         types.ts - ILivePhotoAsset, ILivePhotoViewHandle, ILivePhotoPlaybackStyle.
src/react/               @symbiote-native/live-photo/react   - LivePhotoView (ref carries the handle)
src/vue/                 @symbiote-native/live-photo/vue     - LivePhotoView (a template ref, the functions are exposed)
src/svelte/              @symbiote-native/live-photo/svelte  - LivePhotoView (bind:this)
src/solid/               @symbiote-native/live-photo/solid   - LivePhotoView (ref={fn})
src/angular/             @symbiote-native/live-photo/angular - LivePhotoView (the functions are methods)
```

A native Expo view keeps its functions on its module's view prototypes and native finds the view by its
native tag, so the engine's `defineExpoViewMethods` makes that call. Each adapter only hands over its host
node. `native-link.json` carries only `ios.upstreamPackage`, upstream has no Android folder.

## Use it

### React

```tsx
import { useRef } from 'react';
import { LivePhotoView, type ILivePhotoViewHandle } from '@symbiote-native/live-photo/react';

const handle = useRef<ILivePhotoViewHandle>(null);

<LivePhotoView
  ref={handle}
  style={{ width: 300, height: 400 }}
  source={{ photoUri, pairedVideoUri }}
  onLoadError={error => console.warn(error.message)}
/>;
<button title="Play" onPress={() => handle.current?.startPlayback('hint')} />;
```

### Vue

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { LivePhotoView, type ILivePhotoViewHandle } from '@symbiote-native/live-photo/vue';

const handle = ref<ILivePhotoViewHandle | null>(null);
</script>

<template>
  <LivePhotoView
    ref="handle"
    :style="{ width: 300, height: 400 }"
    :source="{ photoUri, pairedVideoUri }"
    @loadError="error => console.warn(error.message)"
  />
  <button title="Play" @press="handle?.startPlayback('hint')" />
</template>
```

### Angular

```ts
import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { LivePhotoView } from '@symbiote-native/live-photo/angular';

@Component({
  standalone: true,
  imports: [LivePhotoView, SYMBIOTE_ELEMENTS],
  template: `
    <LivePhotoView
      #view
      [style]="{ width: 300, height: 400 }"
      [source]="{ photoUri, pairedVideoUri }"
      [onLoadError]="onLoadError"
    />
    <button title="Play" (press)="view.startPlayback('hint')" />
  `,
})
export class LivePhotoCard {
  readonly photoUri = '...';
  readonly pairedVideoUri = '...';
  readonly onLoadError = (error: { message: string }): void => console.warn(error.message);
}
```

### Svelte

```svelte
<script lang="ts">
  import { LivePhotoView, type ILivePhotoViewHandle } from '@symbiote-native/live-photo/svelte';

  let handle = $state<ILivePhotoViewHandle | undefined>();
</script>

<LivePhotoView
  bind:this={handle}
  style={{ width: 300, height: 400 }}
  source={{ photoUri, pairedVideoUri }}
  onLoadError={error => console.warn(error.message)}
/>
<button title="Play" onPress={() => handle?.startPlayback('hint')} />
```

### Solid

```tsx
import { createSignal } from 'solid-js';
import { LivePhotoView, type ILivePhotoViewHandle } from '@symbiote-native/live-photo/solid';

const [handle, setHandle] = createSignal<ILivePhotoViewHandle>();

<LivePhotoView
  ref={setHandle}
  style={{ width: 300, height: 400 }}
  source={{ photoUri, pairedVideoUri }}
  onLoadError={error => console.warn(error.message)}
/>;
<button title="Play" onPress={() => handle()?.startPlayback('hint')} />;
```

## API

```ts
<LivePhotoView source={{ photoUri, pairedVideoUri }} isMuted?={true} contentFit?={'contain' | 'cover'}
               useDefaultGestureRecognizer?={true}
               onLoadStart? onPreviewPhotoLoad? onLoadComplete? onLoadError?({ message }) onPlaybackStart? onPlaybackStop? />
// handle:
startPlayback(style?: 'full' | 'hint'): void     // default 'full'
stopPlayback(): void
```

Off iOS the view renders nothing, with a warning in development, and the handle throws
`UnavailabilityError`. Ported from upstream's `LivePhotoView.tsx`.

## Notes

- **iOS only.** Off iOS the view renders nothing, with a warning in development, and the handle
  throws `UnavailabilityError`. Check `Platform.OS` before you render it.
- **A Live Photo is two files.** The still photo and the paired video, and they must stay a pair:
  the pairing lives in their metadata, so editing or recompressing either one breaks it.
- **Playback style.** `startPlayback()` plays the full clip, `startPlayback('hint')` plays the short
  preview you see when you press a photo in the Photos app.
- **Muted by default.** `isMuted` is `true`, unmute it when the sound is part of the content.
- **Press and hold plays** while `useDefaultGestureRecognizer` is `true`. Turn it off and call
  `startPlayback` yourself if the photo has its own gestures.
- **Not ported.** Nothing. Upstream ships no tests and no config plugin, the suites here are written against its behavior.

## Common questions

- **Where do the two URIs come from?** `@symbiote-native/image-picker` with
  `mediaTypes: ['livePhotos']`: `assets[0].uri` and `assets[0].pairedVideoAsset?.uri`. A photo in
  iCloud needs `shouldDownloadFromNetwork`.
- **No Live Photo in the Simulator.** The Simulator cannot make one, use a real device.
- **`onLoadError` or no playback.** The files are not one pair, or one was edited. Pass the two URIs
  of one pick, untouched.
- **Media library.** Resolving the still half was reported to throw for some assets, prefer the
  picker.
- **No sound.** `isMuted` defaults to `true`.
- **Playback styles.** `startPlayback('full')` or `startPlayback('hint')`.
- **Android.** Not available, the view renders nothing.

Sources: [Expo docs: LivePhoto](https://docs.expo.dev/versions/latest/sdk/live-photo/),
[expo/expo#47730](https://github.com/expo/expo/issues/47730),
[expo/expo#46512](https://github.com/expo/expo/issues/46512),
[expo/expo#48658](https://github.com/expo/expo/issues/48658).

## Test it

No device is needed for the logic. The core tests (`src/core/*.test.ts`) replace `expo-modules-core`
(`requireNativeViewManager`, `Platform`) and assert the descriptor a render function returns. The
adapter tests (`src/{react,vue,solid,angular}/**/*.test.*`, `vitest`) render the real component over the
recording Fabric with an injected view config and assert the committed payload, and Svelte's
`*.smoke.test.ts` compile the `.svelte` files and mount them. Painting itself is verified on a device in
the six `examples/expo-*` canary apps (`examples/expo-react`, `examples/expo-vue-sfc`,
`examples/expo-vue-tsx`, `examples/expo-svelte`, `examples/expo-solid`, `examples/expo-angular`), see the
parent [README](../../README.md).
