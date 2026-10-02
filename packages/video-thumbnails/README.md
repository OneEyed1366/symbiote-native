# @symbiote-native/video-thumbnails

Show a preview image for a video without playing it: pick a moment, get a file. One API for every
[SymbioteNative](../../README.md) adapter (React, Vue, Svelte, Solid and Angular).

> **Deprecated upstream.** Expo replaced
> [`expo-video-thumbnails`](https://github.com/expo/expo/tree/main/packages/expo-video-thumbnails)
> with `generateThumbnailsAsync` in `expo-video` and ships no further patches. It is ported here for
> parity with the rest of the Expo surface.

Built the same way as [`@symbiote-native/print`](../print): an `expo-modules-core`-based wrapper
(see the `symbiote-expo-native-module` project skill for the full mechanism).

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --video-thumbnails
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --video-thumbnails
```

Either way: installs `@symbiote-native/video-thumbnails` and wires the native autolinking
automatically - see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/video-thumbnails
```

`expo-video-thumbnails` and `expo-modules-core` come along as regular, pinned dependencies -
never install either yourself, and never add the `expo` meta-package to this project.

### Required one-time step: native autolinking wiring

Same one-time app wiring every `expo-modules-core` package shares - see
[`@symbiote-native/print`'s README](../print/README.md#required-one-time-step-native-autolinking-wiring)
for the full table; nothing package-specific here.

### No permissions, no config plugin

- **No runtime permission on either platform.** The module only ever reads a URI the caller
  already has access to.
- **No manifest edit.** `expo-video-thumbnails`'s own `AndroidManifest.xml` declares nothing.
- **No config plugin.** Upstream ships none.

</details>

## Shape

```
src/core/                 the whole API: getThumbnailAsync. native-module.ts resolves
                          ExpoVideoThumbnails through expo-modules-core's requireNativeModule.
src/angular/              @symbiote-native/video-thumbnails/angular
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto `src/core/` -
the whole export surface is one stateless async function, nothing to wrap in a hook/composable.

## Use it

```ts
import { getThumbnailAsync } from '@symbiote-native/video-thumbnails';

const { uri, width, height } = await getThumbnailAsync('file:///video.mp4', {
  time: 2000,
  quality: 0.8,
});
```

## API

| Export              | Signature                                                               | Notes                                       |
| -------------------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| `getThumbnailAsync`  | `(sourceFilename: string, options?: IVideoThumbnailsOptions) => Promise<IVideoThumbnailsResult>` | `time` in ms, `quality` `0.0`-`1.0`, optional remote `headers`. |

## Common questions

- **New code?** No: deprecated upstream in favor of `generateThumbnailsAsync` in `expo-video`.
- **Never resolves, or fails on some Android devices.** The most reported upstream problem, mostly
  certain codecs and `.mov` files on older Android. Test with your real videos and handle failure.
- **Two thumbnails close together look the same.** Nearby `time` values can return the same frame;
  space them further apart.
- **Remote video.** Pass the URL (and `headers` if needed); a local file is more reliable.

Sources: [Expo docs: VideoThumbnails](https://docs.expo.dev/versions/latest/sdk/video-thumbnails/),
[expo/expo#7832](https://github.com/expo/expo/issues/7832),
[expo/expo#19165](https://github.com/expo/expo/issues/19165),
[expo/expo#12429](https://github.com/expo/expo/issues/12429).

## Test it

```bash
pnpm vitest run packages/video-thumbnails
```

Upstream ships no test suite of its own (`expo-video-thumbnails`'s `src/` has no `__tests__`), so
nothing to port - every test here is net-new coverage of the ported logic (option defaulting,
argument forwarding, result passthrough).
