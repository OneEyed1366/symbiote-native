# @symbiote-native/speech

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-speech`](https://github.com/expo/expo/tree/main/packages/expo-speech) - text-to-speech -
usable from **every** adapter, React, Vue, Svelte, Solid, and Angular, not just React. Built the
same way as [`@symbiote-native/print`](../print): an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism).

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

- **Web-only fields dropped.** Upstream's `Speech.types.ts` also carries `WebVoice`,
  `SpeechEventCallback` (a raw DOM `SpeechSynthesisEvent` callback shape), `_voiceIndex`, and
  `onMark`/`onPause`/`onResume` - all reachable only through `expo-speech`'s separate web
  implementation. This package only wraps the apple/android native modules (`expo-speech`'s own
  `expo-module.config.json` lists no `"web"` platform either), so none of it applies here.

## Test it

```bash
pnpm vitest run packages/speech
```

Upstream ships no test suite of its own (`expo-speech`'s `src/` has no `__tests__`), so nothing to
port - every test here is net-new coverage of the ported logic (the callback registry, per-id
event routing, the listen/unlisten toggle, and every `UnavailabilityError` branch).
