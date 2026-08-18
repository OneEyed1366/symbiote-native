# @symbiote-native/standard-web-crypto

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-standard-web-crypto`](https://github.com/expo/expo/tree/main/packages/expo-standard-web-crypto)
— a partial W3C [Web Crypto API](https://www.w3.org/TR/WebCryptoAPI/) polyfill exposing
`crypto.getRandomValues` — usable from **every** adapter, React, Vue, and Angular, not just React.
Unlike this repo's other Expo ports, this package needs **no native module of its own** — upstream
is a ~15-line pure-JS shim that delegates straight to `expo-crypto`'s own `getRandomValues`; this
port delegates to [`@symbiote-native/crypto`](../crypto)'s `getRandomValues` instead, since this
repo already ships that native random source as a sibling package. Like `@symbiote-native/crypto`,
every export here is a plain function/object with no per-instance state or event stream, so there
is no hook/composable/service to wrap — the React, Vue, and Angular entry points are plain
re-exports of the same `core`.

## Install

```bash
npm install @symbiote-native/standard-web-crypto @symbiote-native/crypto
```

`@symbiote-native/crypto` comes along as a regular dependency and does the actual native random-byte
generation — see [its README](../crypto/README.md) for `expo-crypto`'s own native autolinking
requirements (already satisfied in any app that already wires up `@symbiote-native/crypto` or
`@symbiote-native/device`).

No further native wiring is needed for this package itself — it has no native module of its own.

## Shape

```
src/core/     web-crypto.ts — the Crypto class + webCrypto singleton (default export) and
              polyfillWebCrypto(), delegating to @symbiote-native/crypto's getRandomValues.
src/react/    @symbiote-native/standard-web-crypto/react   — export * from '../core'
src/vue/      @symbiote-native/standard-web-crypto/vue     — export * from '../core'
src/angular/  @symbiote-native/standard-web-crypto/angular — export * from '../core'
```

No per-adapter lifecycle wrapper exists because there's nothing to subscribe to or clean up —
each adapter entry is a single-file re-export.

## Use it

```ts
import webCrypto, { polyfillWebCrypto } from '@symbiote-native/standard-web-crypto';

// Reach the polyfill (or a real globalThis.crypto, if one already exists) directly:
const bytes = new Uint8Array(16);
webCrypto.getRandomValues(bytes);

// Or install it as globalThis.crypto for any library that expects the Web Crypto API to
// already be present — a no-op if globalThis.crypto is already defined:
polyfillWebCrypto();
crypto.getRandomValues(bytes);
```

The React/Vue/Angular entry points re-export the identical surface:

```ts
import webCrypto, { polyfillWebCrypto } from '@symbiote-native/standard-web-crypto/react';
import webCrypto, { polyfillWebCrypto } from '@symbiote-native/standard-web-crypto/vue';
import webCrypto, { polyfillWebCrypto } from '@symbiote-native/standard-web-crypto/angular';
```

## API

```ts
const webCrypto: {
  getRandomValues<TArray extends ArrayBufferView>(values: TArray): TArray;
};
export default webCrypto;

function polyfillWebCrypto(): void;
```

Plus the `IWebCrypto` type describing the shape above.

## Notes

- **`webCrypto` is resolved once, at module-load time**: if `globalThis.crypto` already exists
  (a real Web Crypto implementation), `webCrypto` _is_ that object; otherwise it's this package's
  own `Crypto` class instance backed by `@symbiote-native/crypto`. React Native has no reliable
  `window` global, so this port checks/defines `globalThis.crypto` rather than upstream's `window`.
- **`getRandomValues` only accepts the integer TypedArrays `@symbiote-native/crypto` can hand to
  its native module** (`Int8Array`/`Uint8Array`/`Int16Array`/`Uint16Array`/`Int32Array`/
  `Uint32Array`) — passing any other `ArrayBufferView` (a `DataView`, `Uint8ClampedArray`, a
  `Float32Array`, …) throws a `TypeError`, the same way upstream's own `getRandomValues` rejects an
  unsupported view.
- `polyfillWebCrypto()` is a no-op when `globalThis.crypto` is already defined — it never
  overwrites an existing implementation.

## Test it

Every export here is a pure function/object surface, never a view or per-instance state — no
Fabric/Descriptor angle at all. Tests mock `@symbiote-native/crypto`'s `getRandomValues` directly
(`src/core/web-crypto.test.ts`, `vitest`) — no `installFabric()`, no ViewConfig.
