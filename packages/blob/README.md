# @symbiote-native/blob

Build, slice and read binary data with the same `Blob` you use in the browser. React Native's own
`Blob` has gaps, notably in `slice()`; this one follows the W3C File API. One API for every
[SymbioteNative](../../README.md) adapter (React, Vue, Svelte, Solid and Angular).

It wraps [`expo-blob`](https://github.com/expo/expo/tree/main/packages/expo-blob), a native,
JSI-backed `Blob`, the same way [`@symbiote-native/print`](../print) wraps its upstream:
`expo-modules-core` is a direct dependency and the upstream JS is hand-ported into `core/`. See the
`symbiote-expo-native-module` project skill for the full mechanism.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --blob
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --blob
```

Either way: installs `@symbiote-native/blob` and wires the native autolinking automatically -
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/blob
```

`expo-blob` and `expo-modules-core` come along as regular, pinned dependencies - never install
either yourself, and never add the `expo` meta-package to this project.

### Required one-time step: native autolinking wiring

Same one-time app wiring every `expo-modules-core` package shares - see
[`@symbiote-native/print`'s README](../print/README.md#required-one-time-step-native-autolinking-wiring)
for the full table; nothing package-specific here.

### No permissions, no config plugin

- **No runtime permission on either platform.** A `Blob` is pure in-memory/on-device data.
- **No manifest edit.** `expo-blob`'s own `AndroidManifest.xml` declares nothing.
- **No config plugin.** Upstream ships none.

</details>

## Shape

```
src/core/                 the whole API: the Blob class. native-module.ts resolves ExpoBlob
                          through expo-modules-core's requireNativeModule.
src/angular/              @symbiote-native/blob/angular
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto `src/core/` -
`Blob` is a plain class with no framework lifecycle to wrap.

## Use it

```ts
import { Blob } from '@symbiote-native/blob';

const blob = new Blob(['hello ', 'world'], { type: 'text/plain' });
blob.size; // 11
blob.type; // 'text/plain'

const text = await blob.text();
const bytes = await blob.bytes();
const buffer = await blob.arrayBuffer();
const firstFive = blob.slice(0, 5, 'text/plain');
```

## API

| Export | Notes |
| ------ | ----- |
| `Blob` | Constructor: `(blobParts?: IBlobPart[], options?: IBlobPropertyBag)`. `IBlobPart = string \| ArrayBuffer \| ArrayBufferView \| Blob`. Instance: `size`, `type`, `slice(start?, end?, contentType?)`, `bytes()`, `text()`, `arrayBuffer()`, `stream()`, `toString()`. |

## Notes

- **This package's `tsconfig.json` adds `"DOM"` to its `lib` array** (every other package here
  stays `ES2022`-only) - the ported API's shape genuinely needs `ReadableStream`,
  `ReadableByteStreamController`, and `BlobPropertyBag`, none of which exist in the plain ES lib.
  Scoped to this package only; nothing else in the repo is affected.
- **`.stream()` needs a global `ReadableStream` to actually run.** Hermes/React Native ship no
  WHATWG Streams implementation - `new ReadableStream(...)` throws `ReferenceError` unless the
  app installs a polyfill (e.g. `web-streams-polyfill`). Typed and ported for parity; this is an
  environment prerequisite, not a porting gap.

## Common questions

- **Why not React Native's `Blob`?** It lacks `text()`, `bytes()`, `arrayBuffer()` and `stream()`
  and has gaps in `slice()`; this one follows the File API.
- **`ReferenceError: ReadableStream is not defined`.** Hermes has no Streams; install a polyfill
  (`web-streams-polyfill`) or use `arrayBuffer()` / `bytes()`.
- **Upload a blob.** Pass it as a `fetch` body or append it to a `FormData`.
- **Does `.stream()` avoid loading everything?** No: it loads the whole blob into memory first.

Sources: [Expo docs: Blob](https://docs.expo.dev/versions/latest/sdk/blob/),
[expo/expo#33463](https://github.com/expo/expo/pull/33463).

## Test it

```bash
pnpm vitest run packages/blob
```

Upstream ships no test suite of its own (`expo-blob`'s `src/` has no `__tests__`), so nothing to
port - every test here is net-new coverage of the ported logic (constructor validation, part
concatenation, `slice`'s prototype-fixup, `arrayBuffer`'s fresh-buffer guarantee, `stream`'s
default read path).
