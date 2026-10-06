# @symbiote-native/video

[`expo-video`](https://docs.expo.dev/versions/latest/sdk/video/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. The player, the
view, thumbnails, the video cache and the AirPlay button.

Built the same way as [`@symbiote-native/clipboard`](../clipboard)'s `ClipboardPasteButton`, an
`expo-modules-core` native view reached through `requireNativeViewManager` (see the
`symbiote-expo-native-module` project skill: why `expo-modules-core` is depended on directly and never
the `expo` meta-package, why the upstream JS is hand-ported into `core/`, and how autolinking finds the
native module). One render function in `core/` returns a descriptor and every adapter only turns it into
its own element.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --video
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --video
```

Either way: installs `@symbiote-native/video` and wires the native autolinking automatically,
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/video
```

Depends on `expo-video` and `expo-modules-core` directly (regular dependencies, pinned to exact
versions, since this package's `core/` is hand-ported against one specific native API shape).
Never install `expo-video` yourself, and never add the `expo` package to this project: it bundles
its own Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

`expo-video`'s native code is discovered by `expo-modules-autolinking`, not by RN's own
`react-native.config.cjs` mechanism. Wire it into the native host app **once**, it covers this package
and every other `expo-modules-core` package with zero further changes. The steps and the
mechanics behind them are in the `symbiote-expo-native-module` skill and in
[`@symbiote-native/network`](../network)'s README; the reference app is `examples/expo-react`.

### Background playback and Picture in Picture

The package writes nothing by default. For iOS add `audio` to `UIBackgroundModes` in `Info.plist`.
For Android choose the "Background video playback" bundle (the foreground service and its permissions),
and give the main activity `android:supportsPictureInPicture="true"` for Picture in Picture.

</details>

## Shape

```
src/core/                video-player.ts and video-player-controller.ts (the player and its lifecycle over
                         the engine's createJsonKeyedResourceController), video-view.ts
                         (createVideoView(getNode)), video-airplay-button.ts, video-source.ts,
                         video-module.ts (cache and Picture in Picture functions), video-thumbnail.ts.
src/react/               @symbiote-native/video/react   - VideoView, useVideoPlayer
src/vue/                 @symbiote-native/video/vue     - VideoView, useVideoPlayer (a computed ref)
src/svelte/              @symbiote-native/video/svelte  - VideoView, useVideoPlayer ({ current })
src/solid/               @symbiote-native/video/solid   - VideoView, useVideoPlayer (an accessor)
src/angular/             @symbiote-native/video/angular - VideoView, injectVideoPlayer (a signal)
```

`VideoView` is one component per platform (`VideoView` on iOS, `SurfaceVideoView` or `TextureVideoView` on
Android), and the view functions follow the surface the last render chose. `VideoAirPlayButton` is a plain
view off iOS. `useEvent` and `useEventListener` come from each adapter, not from this package.

## Use it

### React

```tsx
import { VideoView, useVideoPlayer } from '@symbiote-native/video/react';

const player = useVideoPlayer('https://example.com/video.mp4', player => {
  player.loop = true;
  player.play();
});

<VideoView player={player} style={{ width: 320, height: 180 }} nativeControls />;
```

### Vue

```vue
<script setup lang="ts">
import { VideoView, useVideoPlayer } from '@symbiote-native/video/vue';

const player = useVideoPlayer(
  () => 'https://example.com/video.mp4',
  instance => {
    instance.loop = true;
    instance.play();
  },
);
</script>

<template>
  <VideoView :player="player" :style="{ width: 320, height: 180 }" :nativeControls="true" />
</template>
```

### Angular

```ts
import { Component } from '@angular/core';
import { VideoView, injectVideoPlayer } from '@symbiote-native/video/angular';

@Component({
  standalone: true,
  imports: [VideoView],
  template: `
    <VideoView [player]="player()" [style]="{ width: 320, height: 180 }" [nativeControls]="true" />
  `,
})
export class Clip {
  readonly player = injectVideoPlayer(
    () => 'https://example.com/video.mp4',
    instance => {
      instance.loop = true;
      instance.play();
    },
  );
}
```

### Svelte

```svelte
<script lang="ts">
  import { VideoView, useVideoPlayer } from '@symbiote-native/video/svelte';

  const player = useVideoPlayer(
    () => 'https://example.com/video.mp4',
    instance => {
      instance.loop = true;
      instance.play();
    },
  );
</script>

<VideoView player={player.current} style={{ width: 320, height: 180 }} nativeControls />
```

### Solid

```tsx
import { VideoView, useVideoPlayer } from '@symbiote-native/video/solid';

const player = useVideoPlayer(
  () => 'https://example.com/video.mp4',
  instance => {
    instance.loop = true;
    instance.play();
  },
);

<VideoView player={player()} style={{ width: 320, height: 180 }} nativeControls />;
```

## API

```ts
useVideoPlayer(source, setup?, options?): VideoPlayer     // released on unmount, per adapter see Shape
createVideoPlayer(source, options?): VideoPlayer          // you call player.release()

<VideoView player nativeControls? contentFit? surfaceType?={'surfaceView' | 'textureView'}   // Android
           allowsPictureInPicture? ... />
<VideoAirPlayButton ... />                                // plain view off iOS

isPictureInPictureSupported(): boolean
setVideoCacheSizeAsync(sizeBytes): Promise<void>   clearVideoCacheAsync(): Promise<void>
getCurrentVideoCacheSize(): number                // all three work only while no player exists
```

The player is the native `VideoPlayer` shared object, `{ uri, useCaching }` sources enable the cache.
Ported from upstream's `VideoPlayer.ts`, `VideoView.tsx`, `VideoAirPlayButton.tsx` and `index.ts`.

## Notes

- **One player, one `VideoView` on Android.** Mounting several views with the same player does not
  work there, a platform limitation. iOS accepts it. Create a player per visible view, or move the
  player to the new view only after the old one is gone.
- **`useVideoPlayer` releases the player for you.** It disposes of it when the component unmounts,
  and a changed source or options make a new one. A player from `createVideoPlayer` is yours:
  call `release()` when you are done, or it leaks.
- **Android renders on a surface by default.** `surfaceType="surfaceView"` is the efficient choice,
  `surfaceType="textureView"` composes like an ordinary view and costs more performance.
- **Caching is per source.** Set `useCaching: true` on the source object. The cache is persistent
  and trimmed least-recently-used, 1 GB by default, and works offline for what it holds.
  iOS cannot cache HLS, and DRM-protected video is not cached on either platform.
- **The cache functions work only while no player exists**, so call `setVideoCacheSizeAsync` and
  `clearVideoCacheAsync` before you create one.
- **`useEvent` and `useEventListener` come from the adapter**, not from this package. See the aside
  above.
- **Not ported.** The web build. `useEvent` / `useEventListener` ship with the `expo` package upstream, here the adapters export them for any emitter (`useEvent(player, 'statusChange')`, `injectEvent` in Angular, `@symbiote-native/svelte/runes/use-event` in Svelte). Upstream ships no tests, the suites here are written against its behavior.

## Common questions

- **Black screen on Android.** One player in several `VideoView`s does not work there. Keep one view
  per player and unmount the old view first.
- **Overlap or out of bounds on Android.** An ExoPlayer bug with `contentFit="cover"`. Set
  `surfaceType="textureView"`.
- **`zIndex` ignored on Android.** The default surface draws above its surroundings. Try
  `surfaceType="textureView"`.
- **Touch handlers do not fire on Android.** Put the handler on a wrapping view.
- **Not released.** `useVideoPlayer` releases on unmount, a player from `createVideoPlayer` needs
  `player.release()`.
- **Fullscreen will not rotate on Android.** It follows the app's orientation lock, unlock it with
  `@symbiote-native/screen-orientation`.
- **Caching.** `{ uri, useCaching: true }`. 1 GB by default, not for HLS on iOS or DRM. The cache
  functions work only while no player exists.

Sources: [Expo docs: Video](https://docs.expo.dev/versions/latest/sdk/video/),
[expo/expo#35012](https://github.com/expo/expo/issues/35012),
[expo/expo#31248](https://github.com/expo/expo/issues/31248),
[expo/expo#31722](https://github.com/expo/expo/issues/31722),
[expo/expo#30275](https://github.com/expo/expo/issues/30275),
[expo/expo#34630](https://github.com/expo/expo/issues/34630),
[expo/expo#33804](https://github.com/expo/expo/issues/33804),
[expo/expo#9899](https://github.com/expo/expo/issues/9899).

## Test it

No device is needed for the logic. The core tests (`src/core/*.test.ts`) replace `expo-modules-core`
(`requireNativeViewManager`, `Platform`) and assert the descriptor a render function returns. The
adapter tests (`src/{react,vue,solid,angular}/**/*.test.*`, `vitest`) render the real component over the
recording Fabric with an injected view config and assert the committed payload, and Svelte's
`*.smoke.test.ts` compile the `.svelte` files and mount them. Painting itself is verified on a device in
the six `examples/expo-*` canary apps (`examples/expo-react`, `examples/expo-vue-sfc`,
`examples/expo-vue-tsx`, `examples/expo-svelte`, `examples/expo-solid`, `examples/expo-angular`), see the
parent [README](../../README.md).
