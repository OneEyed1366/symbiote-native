# @symbiote-native/speech

Read text aloud with the device's text-to-speech engine, with a choice of voice, language, pitch and
rate. One API for every [SymbioteNative](../../README.md) adapter (React, Vue, Svelte, Solid and
Angular).

It wraps [`expo-speech`](https://github.com/expo/expo/tree/main/packages/expo-speech) the same way
[`@symbiote-native/print`](../print) wraps its upstream: `expo-modules-core` is a direct
dependency and the upstream JS is hand-ported into `core/`. See the `symbiote-expo-native-module`
project skill for the full mechanism.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --speech
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --speech
```

Either way: installs `@symbiote-native/speech` and wires the native autolinking automatically -
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/speech
```

`expo-speech` and `expo-modules-core` come along as regular, pinned dependencies - never install
either yourself, and never add the `expo` meta-package to this project.

### Required one-time step: native autolinking wiring

Same one-time app wiring every `expo-modules-core` package shares - see
[`@symbiote-native/print`'s README](../print/README.md#required-one-time-step-native-autolinking-wiring)
for the full table; nothing package-specific here.

### No app-level permission, no config plugin

- **No runtime permission request from this package.** Android needs a `<queries>` entry
  declaring the `android.intent.action.TTS_SERVICE` intent to see installed TTS engines on
  API 30+ - `expo-speech`'s own bundled `AndroidManifest.xml` already carries it, and Android's
  manifest merger folds it into the app automatically. No `native-link.json` entry exists for
  this (there is no such field, and none is needed).
- **No config plugin.** Upstream ships none.

</details>

## Shape

```
src/core/                 the whole API: speak, getAvailableVoicesAsync, isSpeakingAsync, stop,
                          pause, resume, maxSpeechInputLength, VoiceQuality. native-module.ts
                          resolves ExpoSpeech through expo-modules-core's requireNativeModule.
src/angular/              @symbiote-native/speech/angular
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto `src/core/` -
every export here is a stateless function or constant, nothing to wrap in a hook/composable.

## Use it

```ts
import { speak, stop, isSpeakingAsync } from '@symbiote-native/speech';

speak('Hello world', {
  language: 'en-US',
  onDone: () => console.log('done'),
});

if (await isSpeakingAsync()) {
  await stop();
}
```

## API

| Export                    | Signature                                              | Notes                                        |
| -------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `speak`                   | `(text: string, options?: ISpeechOptions) => void`        | Queues onto any in-flight utterance.           |
| `getAvailableVoicesAsync`  | `() => Promise<IVoice[]>`                                 | Throws `UnavailabilityError` if unsupported.   |
| `isSpeakingAsync`         | `() => Promise<boolean>`                                  | `true` even while paused.                      |
| `stop`                    | `() => Promise<void>`                                     | Interrupts and clears the whole queue.         |
| `pause` / `resume`        | `() => Promise<void>`                                     | iOS only - throws `UnavailabilityError` on Android. |
| `maxSpeechInputLength`    | `number`                                                  | `Number.MAX_VALUE` on iOS.                     |
| `VoiceQuality`            | `{ Default, Enhanced }`                                   | Enum on `IVoice.quality`.                      |

## Notes

- **No sound in iOS silent mode.** On a physical iPhone `speak` is silent while the device is in
  silent mode, so it can look like the call did nothing.
- **`speak` queues, it does not interrupt.** Call `stop()` first to replace what is being said.
- **Android rejects text longer than `maxSpeechInputLength`.** Split long text into sentences and
  queue them.
- **Web-only fields dropped.** Upstream's `Speech.types.ts` also carries `WebVoice`,
  `SpeechEventCallback` (a raw DOM `SpeechSynthesisEvent` callback shape), `_voiceIndex`, and
  `onMark`/`onPause`/`onResume` - all reachable only through `expo-speech`'s separate web
  implementation. This package only wraps the apple/android native modules (`expo-speech`'s own
  `expo-module.config.json` lists no `"web"` platform either), so none of it applies here.

## Common questions

- **No sound on iOS.** Check silent mode first (a physical iPhone is silent then).
- **`voice` ignored, short voice list.** Pass an `identifier` from `getAvailableVoicesAsync()`
  exactly; the voices installed differ by device and iOS version.
- **Non-English speech wrong on Android.** Set `language` to a BCP 47 code and install that voice in
  the device's text-to-speech settings.
- **`onDone` missing after pause/resume.** Pause reports `onStopped`; track state yourself.
- **Long text rejected.** Android limits input to `maxSpeechInputLength`; queue sentences.

Sources: [Expo docs: Speech](https://docs.expo.dev/versions/latest/sdk/speech/),
[expo/expo#10827](https://github.com/expo/expo/issues/10827),
[expo/expo#12654](https://github.com/expo/expo/issues/12654),
[expo/expo#7260](https://github.com/expo/expo/issues/7260).

## Test it

```bash
pnpm vitest run packages/speech
```

Upstream ships no test suite of its own (`expo-speech`'s `src/` has no `__tests__`), so nothing to
port - every test here is net-new coverage of the ported logic (the callback registry, per-id
event routing, the listen/unlisten toggle, and every `UnavailabilityError` branch).
