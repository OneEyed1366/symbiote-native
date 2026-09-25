# @symbiote-native/blob

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-blob`](https://github.com/expo/expo/tree/main/packages/expo-blob) — a native, JSI-backed
`Blob` implementation matching the W3C File API — usable from **every** adapter, React, Vue,
Svelte, Solid, and Angular, not just React. Built the same way as
[`@symbiote-native/print`](../print): an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism).

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --blob
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --blob
```

Either way: installs `@symbiote-native/blob` and wires the native autolinking automatically —
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI — installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/blob
```

`expo-blob` and `expo-modules-core` come along as regular, pinned dependencies — never install
either yourself, and never add the `expo` meta-package to this project.

### Required one-time step: native autolinking wiring

Same one-time app wiring every `expo-modules-core` package shares — see
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

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto `src/core/` —
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
  stays `ES2022`-only) — the ported API's shape genuinely needs `ReadableStream`,
  `ReadableByteStreamController`, and `BlobPropertyBag`, none of which exist in the plain ES lib.
  Scoped to this package only; nothing else in the repo is affected.
- **`.stream()` needs a global `ReadableStream` to actually run.** Hermes/React Native ship no
  WHATWG Streams implementation — `new ReadableStream(...)` throws `ReferenceError` unless the
  app installs a polyfill (e.g. `web-streams-polyfill`). Typed and ported for parity; this is an
  environment prerequisite, not a porting gap.

## Test it

```bash
pnpm vitest run packages/blob
```

Upstream ships no test suite of its own (`expo-blob`'s `src/` has no `__tests__`), so nothing to
port — every test here is net-new coverage of the ported logic (constructor validation, part
concatenation, `slice`'s prototype-fixup, `arrayBuffer`'s fresh-buffer guarantee, `stream`'s
default read path).
