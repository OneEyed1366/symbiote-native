# @symbiote-native/video

[`expo-video`](https://docs.expo.dev/versions/latest/sdk/video/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. The player, the
view, thumbnails, the video cache and the AirPlay button.

## Install

```bash
npx @symbiote-native/cli new my-app --video   # new app
npx @symbiote-native/cli add --video          # existing app
```

Manual: `npm install @symbiote-native/video`, then wire `expo-modules-autolinking` once per app.
Never install `expo-video` or the `expo` meta-package yourself.

## Usage

```tsx
import { VideoView, useVideoPlayer } from '@symbiote-native/video/react';

const player = useVideoPlayer('https://example.com/video.mp4', player => {
  player.loop = true;
  player.play();
});

<VideoView player={player} style={{ width: 320, height: 180 }} nativeControls />;
```

`createVideoPlayer(source, builderOptions?)` makes a player that is not released by itself, call
`player.release()`. The player is the native `VideoPlayer` object: its properties, `play()`,
`pause()`, `replaceAsync()`, `generateThumbnailsAsync()` and `addListener(event, listener)` are
the same on every adapter. The player is created by the hook of the framework, which releases it
when the owner goes away:

| Adapter | Player                                                                  |
| ------- | ----------------------------------------------------------------------- |
| React   | `useVideoPlayer(source, setup?, options?)`                              |
| Vue     | `useVideoPlayer(source, setup?, options?)`, returns a computed ref      |
| Solid   | `useVideoPlayer(() => source, setup?, () => options)`, returns an accessor |
| Svelte  | `useVideoPlayer(() => source, setup?, () => options).current`           |
| Angular | `injectVideoPlayer(() => source, setup?, () => options)`, a signal      |

`setup` runs once on each new player, and a changed source or options make a new one.

The functions of the view (`enterFullscreen`, `exitFullscreen`, `startPictureInPicture`,
`stopPictureInPicture`) are reached by a `ref` in React and Solid (`ref={fn}`), the exposed members
of a template ref in Vue, `bind:this` in Svelte and `@ViewChild` in Angular.

Module functions: `isPictureInPictureSupported()`, `setVideoCacheSizeAsync(bytes)`,
`clearVideoCacheAsync()`, `getCurrentVideoCacheSize()`. `VideoThumbnail` is the native class of the
thumbnails. `VideoAirPlayButton` is the iOS route picker and a plain view elsewhere.

## App setup

Nothing is written by default. Background playback and Picture in Picture need what upstream's
config plugin adds:

- iOS: add `audio` to `UIBackgroundModes` in `Info.plist`.
- Android: pick the "Background video playback" bundle for the foreground service and its
  permissions. Picture in Picture needs `android:supportsPictureInPicture="true"` on the main
  activity.

## Not ported

The web build. `useEvent` / `useEventListener` ship with the `expo` package upstream, here the
adapters export them for any emitter (`useEvent(player, 'statusChange')`, `injectEvent` in
Angular, `@symbiote-native/svelte/runes/use-event` in Svelte). Upstream ships no tests, the suites here are written against its behavior.
