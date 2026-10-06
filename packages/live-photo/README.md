# @symbiote-native/live-photo

[`expo-live-photo`](https://docs.expo.dev/versions/latest/sdk/live-photo/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. Shows a Live
Photo, iOS only.

## Install

```bash
npx @symbiote-native/cli new my-app --live-photo   # new app
npx @symbiote-native/cli add --live-photo          # existing app
```

Manual: `npm install @symbiote-native/live-photo`, then wire `expo-modules-autolinking` once per
app. Never install `expo-live-photo` or the `expo` meta-package yourself.

## Usage

```tsx
import { LivePhotoView, type ILivePhotoViewHandle } from '@symbiote-native/live-photo/react';

const ref = useRef<ILivePhotoViewHandle>(null);

<LivePhotoView
  ref={ref}
  style={{ width: 300, height: 400 }}
  source={{ photoUri, pairedVideoUri }}
  contentFit="cover"
  onLoadError={error => console.warn(error.message)}
/>;

ref.current?.startPlayback('hint');
```

The view takes `source`, `isMuted`, `contentFit`, `useDefaultGestureRecognizer`, the load and
playback callbacks and the View surface. The handle has `startPlayback(style?)` and
`stopPlayback()`. How the handle is reached follows each framework: a `ref` in React and Solid
(`ref={fn}`), the exposed methods of a template ref in Vue, `bind:this` in Svelte and a
`@ViewChild` in Angular.

Off iOS the view renders nothing (with a dev-only warning) and the handle throws
`UnavailabilityError`.

## Not ported

Nothing. Upstream ships no tests and no config plugin, the suites here are written against its
behavior.
