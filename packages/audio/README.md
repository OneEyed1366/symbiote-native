# @symbiote-native/audio

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-audio`](https://github.com/expo/expo/tree/main/packages/expo-audio) usable from **every**
adapter — React, Vue, Svelte, Solid, and Angular. `AudioPlayer`, `AudioRecorder`, `AudioPlaylist`,
and `AudioStream` are JSI-backed `SharedObject` instances — per-instance native objects with real
state and methods, not one-shot functions — so there is no hook/composable/service wrapper here
either: the React, Vue, Svelte, Solid, and Angular entry points are plain re-exports of the same
`core`, and each adapter's own lifecycle code (the equivalent of upstream's `useAudioPlayer`)
decides when to create one and when to call `.remove()` / `.destroy()`.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --audio
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --audio
```

Either way: installs `@symbiote-native/audio`, wires the native autolinking automatically, and — since
this package has an optional, policy-sensitive Android bundle — asks at the end whether to grant
background recording too (see the note below the manual-install block). See
[`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI — installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/audio
```

`expo-audio` and `expo-modules-core` come along as regular dependencies, pinned to exact
versions — never install either yourself, and never add the `expo` meta-package to your project
(it bundles its own Metro/Babel pipeline, which conflicts with this project's own).

## Required one-time step: native autolinking wiring

Same one-time step as every other `expo-modules-core` package this project ships — see
[`@symbiote-native/local-auth`'s README](../local-auth/README.md#required-one-time-step-native-autolinking-wiring)
and the `symbiote-expo-native-module` project skill. Nothing package-specific beyond one Info.plist
string:

- iOS — `NSMicrophoneUsageDescription` in `Info.plist`, wired automatically by
  `@symbiote-native/expo-modules-link`'s aggregator (`native-link.json`'s `ios.infoPlistKeys`) the
  next time it runs — override the default text by adding the key yourself first. Same aggregator
  also adds `UIBackgroundModes: audio` (`ios.infoPlistArrayKeys`) — upstream's own `withAudio.ts`
  config plugin defaults `enableBackgroundPlayback` to `true`, and without this key iOS suspends
  playback the moment the app backgrounds.
- Android — `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS` already ship in `expo-audio`'s own
  `AndroidManifest.xml` and merge automatically, same as every other autolinked permission.
  Background **playback** is wired the same way as iOS: `native-link.json`'s
  `android.manifestPermissions` adds `FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_MEDIA_PLAYBACK`, and
  `android.manifestServices` declares `AudioControlsService` (`foregroundServiceType="mediaPlayback"`)
  — matching upstream's own `withAudio.ts` config plugin, whose `enableBackgroundPlayback` defaults
  to `true`. Background **recording** (`allowsBackgroundRecording: true`) is opt-in, matching
  upstream's own `enableBackgroundRecording` default of `false` — requesting the microphone
  foreground-service type is exactly the kind of thing that should be a deliberate app choice, not
  a package side effect (same reasoning as `@symbiote-native/location`'s background permission).

</details>

**Background recording — opt-in, asked for you.** `new --audio`/`add --audio` above already ask,
interactively, whether to grant it; say yes and `FOREGROUND_SERVICE_MICROPHONE`/
`POST_NOTIFICATIONS` plus the `AudioRecordingService` (`foregroundServiceType="microphone"`)
`<service>` land in your `AndroidManifest.xml` for you, along with the `allowsBackgroundRecording`
call reminder you still need to make in JS. Said no, or ran non-interactively (CI, piped stdin)?
Run it any time after:

```bash
npx @symbiote-native/cli grant audio
```

Idempotent — safe to run again even if already granted.

## Shape

```
src/core/     AudioPlayer / AudioRecorder / AudioPlaylist / AudioStream classes (each a thin
              subclass of the native SharedObject, adding only the JS-side logic upstream's own
              ExpoAudio.ts shims onto the prototype — source resolution on `replace()`, the
              Android arg-count fix for `setPlaybackRate()`, per-platform option processing for
              `prepareToRecordAsync()`), the createAudioPlayer / createAudioPlaylist /
              createAudioStream factories, the audio-session/permission/preload module functions,
              RecordingPresets, and the event-name constants `addListener` accepts.
              native-module.ts resolves the native module via expo-modules-core's
              requireNativeModule.
src/angular/  @symbiote-native/audio/angular — export * from '../core'
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto
`src/core/`. `./angular` stays a physical file/subpath since Angular ships through a separate
`ngc`/AOT build (`build-ngc/`).

## Use it

```ts
import {
  createAudioPlayer,
  PLAYBACK_STATUS_UPDATE,
  setAudioModeAsync,
} from '@symbiote-native/audio';

await setAudioModeAsync({
  playsInSilentMode: true,
  shouldPlayInBackground: false,
});

const player = createAudioPlayer('https://example.com/track.mp3');
player.play();

const subscription = player.addListener(PLAYBACK_STATUS_UPDATE, status => {
  console.log(status.currentTime, status.duration, status.playing);
});

// later, e.g. on unmount:
subscription.remove();
player.remove();
```

Recording:

```ts
import {
  AudioRecorder,
  RECORDING_STATUS_UPDATE,
  RecordingPresets,
  requestRecordingPermissionsAsync,
} from '@symbiote-native/audio';

const { granted } = await requestRecordingPermissionsAsync();
if (!granted) throw new Error('Microphone permission denied');

const recorder = new AudioRecorder(RecordingPresets.HIGH_QUALITY);
await recorder.prepareToRecordAsync();
recorder.record();
recorder.addListener(RECORDING_STATUS_UPDATE, status => console.log(status));
// … later
await recorder.stop();
```

Playlist and real-time PCM streaming follow the same `create*` + `addListener` shape:
`createAudioPlaylist({ sources: [...], loop: 'all' })` and `createAudioStream()` — the stream
factory takes no `onBuffer` callback (unlike upstream's `useAudioStream` hook); subscribe with
`stream.addListener(AUDIO_STREAM_BUFFER, ...)` after `stream.start()`, same as every other event
on these classes.

Identical import surface on every adapter — `@symbiote-native/audio/react`, `/vue`, `/svelte`,
`/solid`, `/angular` all re-export the same classes and functions.

## API

```ts
class AudioPlayer extends SharedObject {
  id: string; playing: boolean; muted: boolean; loop: boolean; paused: boolean; isLoaded: boolean;
  isAudioSamplingSupported: boolean; isBuffering: boolean; currentTime: number; duration: number;
  volume: number; playbackRate: number; shouldCorrectPitch: boolean; currentStatus: IAudioStatus;
  play(): void; pause(): void; replace(source: IAudioSource): void;
  seekTo(seconds: number, toleranceMillisBefore?: number, toleranceMillisAfter?: number): Promise<void>;
  setPlaybackRate(rate: number, pitchCorrectionQuality?: IPitchCorrectionQuality): void;
  setAudioSamplingEnabled(enabled: boolean): void;
  setActiveForLockScreen(active: boolean, metadata?: IAudioMetadata, options?: IAudioLockScreenOptions): void;
  updateLockScreenMetadata(metadata: IAudioMetadata): void;
  clearLockScreenControls(): void;
  remove(): void;
}
createAudioPlayer(source?: IAudioSource, options?: IAudioPlayerOptions): AudioPlayer

class AudioRecorder extends SharedObject {
  id: string; currentTime: number; isRecording: boolean; uri: string | null;
  record(options?: IRecordingStartOptions): void; stop(): Promise<void>; pause(): void;
  getAvailableInputs(): IRecordingInput[]; getCurrentInput(): Promise<IRecordingInput>;
  setInput(inputUid: string): void; getStatus(): IRecorderState;
  prepareToRecordAsync(options?: Partial<IRecordingOptions>): Promise<void>;
}

class AudioPlaylist extends SharedObject {
  id: string; readonly currentIndex: number; readonly trackCount: number;
  readonly sources: IAudioSourceInfo[]; playing: boolean; muted: boolean; isLoaded: boolean;
  isBuffering: boolean; currentTime: number; duration: number; volume: number; playbackRate: number;
  loop: IAudioPlaylistLoopMode; currentStatus: IAudioPlaylistStatus;
  play(): void; pause(): void; next(): void; previous(): void; skipTo(index: number): void;
  seekTo(seconds: number): Promise<void>; add(source: IAudioSource): void;
  insert(source: IAudioSource, index: number): void; remove(index: number): void;
  clear(): void; destroy(): void;
}
createAudioPlaylist(options?: IAudioPlaylistOptions): AudioPlaylist

class AudioStream extends SharedObject {
  id: string; readonly sampleRate: number; readonly channels: number; readonly isStreaming: boolean;
  start(): Promise<void>; stop(): void;
}
createAudioStream(options?: IAudioStreamOptions): AudioStream

setIsAudioActiveAsync(active: boolean): Promise<void>
setAudioModeAsync(mode: Partial<IAudioMode>): Promise<void>
requestRecordingPermissionsAsync(): Promise<PermissionResponse>
requestNotificationPermissionsAsync(): Promise<PermissionResponse>  // Android only, throws elsewhere
getRecordingPermissionsAsync(): Promise<PermissionResponse>
preload(source: IAudioSource, options?: IPreloadOptions): Promise<void>
clearPreloadedSource(source: IAudioSource): Promise<void>
clearAllPreloadedSources(): Promise<void>
getPreloadedSources(): Promise<string[]>

RecordingPresets: { HIGH_QUALITY: IRecordingOptions; LOW_QUALITY: IRecordingOptions }
IOSOutputFormat, AudioQuality  // enums, ported from RecordingConstants.ts

PLAYBACK_STATUS_UPDATE, AUDIO_SAMPLE_UPDATE, RECORDING_STATUS_UPDATE, PLAYLIST_STATUS_UPDATE,
TRACK_CHANGED, AUDIO_STREAM_BUFFER, AUDIO_STREAM_STATUS  // event names for .addListener()
```

Plus the full `I`-prefixed type surface ported from upstream's `Audio.types.ts` /
`AudioModule.types.ts` / `AudioStream.types.ts` / `AudioConstants.ts`, re-exported from the
barrel — see `src/core/types.ts`.

## Deliberately not ported

- **`useAudioPlayer` / `useAudioPlayerStatus` / `useAudioSampleListener` / `useAudioRecorder` /
  `useAudioRecorderState` / `useAudioPlaylist` / `useAudioPlaylistStatus` / `useAudioStream`** —
  React hooks, framework-specific by construction. `createAudioPlayer` / `createAudioPlaylist` /
  `createAudioStream` are the framework-agnostic equivalents each already exposes (upstream's own
  hooks are thin wrappers over these plus `useReleasingSharedObject` for cleanup-on-unmount); each
  adapter's own lifecycle wrapper is where a hook/composable/service belongs, per
  `<components_split_logic_view_lifecycle>` in the root project CLAUDE.md. None ship yet.
- **The `Asset`-instance form of `AudioSource`, and the `downloadFirst` player option.** Upstream
  resolves both through `expo-asset` (`Asset.fromModule` / `Asset.downloadAsync`), which depends
  on `expo-constants` and peers on the `expo` meta-package — this project never depends on `expo`
  (root CLAUDE.md's dependency-scope invariant, and the `symbiote-expo-native-module` skill §1).
  The plain `number` form (`require('./song.mp3')`) **is** supported — `resolveSource`/
  `resolveSources` resolve it through RN's own generic `resolveAssetSource`, wired by
  `bootstrapHost`, no `expo-asset` needed.
- **`interruptionModeAndroid`** on `IAudioMode` — upstream marks it `@deprecated`, superseded by
  the cross-platform `interruptionMode`.
- **Web-only surfaces** (`ExpoAudio.web.ts`, `AudioPlayer.web.ts`, `AudioStream.web.ts`,
  `MediaSessionController.web.ts`) — this project targets iOS + Android only.

## Test it

No Fabric/Descriptor angle at all — every class here is a `SharedObject` with no visual
component. Tests fake the native `AudioPlayer`/`AudioRecorder`/`AudioPlaylist`/`AudioStream`
classes `expoAudio` exposes (real prototype methods, so the subclass `super.*()` calls in
`audio-player.ts`/`audio-recorder.ts` resolve correctly) and the plain async module functions
(`src/core/audio-classes.test.ts`, `src/core/audio-module.test.ts`, `src/core/
resolve-source.test.ts`) — no `installFabric()`, no ViewConfig.
