# @symbiote-native/crypto

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-crypto`](https://github.com/expo/expo/tree/main/packages/expo-crypto) — cryptographically
secure random bytes, `randomUUID`, and string/buffer digest hashing — usable from **every**
adapter, React, Vue, and Angular, not just React. Like `@symbiote-native/local-auth`, every
function here is a plain sync/async call with no per-instance state or event stream, so there is
no hook/composable/service to wrap — the React, Vue, and Angular entry points are plain
re-exports of the same `core`. AES encryption (`expo-crypto`'s `aes/` subfolder) is out of scope
for this pass.

## Install

```bash
npm install @symbiote-native/crypto
```

`expo-crypto` and `expo-modules-core` come along as regular dependencies, pinned to exact
versions — never install either yourself, and never add the `expo` meta-package to your project
(it bundles its own Metro/Babel pipeline, which conflicts with this project's own).

## Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-crypto`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism — this needs wiring
into the native host app **once**, covering this package and every other `expo-modules-core`
package with zero further changes:

| Platform | Touches                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | `ios/Podfile` — add `use_expo_modules!`                                                                                                             |
| iOS      | `AppDelegate.swift` — Expo's runtime-bootstrap hook                                                                                                 |
| Android  | `settings.gradle` / `app/build.gradle` — resolve and include the Expo Gradle projects                                                               |
| Android  | `MainApplication.kt` — Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

Full mechanics live in the `symbiote-expo-native-module` project skill. Reference
implementation: `examples/expo-react/ios/Podfile` and
`examples/expo-react/android/app/src/main/java/com/canaryexpo/MainApplication.kt`.

No platform permission strings are needed for this package — random-byte generation and
digest hashing touch no protected device capability.

## Shape

```
src/core/     getRandomBytes / getRandomBytesAsync / getRandomValues / randomUUID /
              digestStringAsync / digest, plus CryptoDigestAlgorithm, CryptoEncoding, the
              option/result types, and the CryptoError validation-error class.
              native-module.ts resolves the native module via expo-modules-core's
              requireNativeModule.
src/react/    @symbiote-native/crypto/react   — export * from '../core'
src/vue/      @symbiote-native/crypto/vue     — export * from '../core'
src/angular/  @symbiote-native/crypto/angular — export * from '../core'
```

No per-adapter lifecycle wrapper exists because there's nothing to subscribe to or clean up —
each adapter entry is a single-file re-export.

## Use it

```tsx
// React
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from '@symbiote-native/react';
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from '@symbiote-native/crypto/react';

function CryptoScreen() {
  const [uuid, setUuid] = useState('');
  const [hash, setHash] = useState('');

  useEffect(() => {
    setUuid(randomUUID());
  }, []);

  const handleHash = () => {
    digestStringAsync(CryptoDigestAlgorithm.SHA256, 'Confirm it is you').then(setHash);
  };

  return (
    <View>
      <Text>UUID: {uuid}</Text>
      <Pressable onPress={handleHash}>
        <Text>Hash a string</Text>
      </Pressable>
      {hash && <Text>SHA-256: {hash}</Text>}
    </View>
  );
}
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Pressable, Text, View } from '@symbiote-native/vue';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from '@symbiote-native/crypto/vue';

const uuid = ref('');
const hash = ref('');

onMounted(() => {
  uuid.value = randomUUID();
});

function handleHash(): void {
  void digestStringAsync(CryptoDigestAlgorithm.SHA256, 'Confirm it is you').then(value => {
    hash.value = value;
  });
}
</script>

<template>
  <View>
    <Text>UUID: {{ uuid }}</Text>
    <Pressable @press="handleHash">
      <Text>Hash a string</Text>
    </Pressable>
    <Text v-if="hash">SHA-256: {{ hash }}</Text>
  </View>
</template>
```

```ts
// Angular
import { Component, signal } from '@angular/core';
import { Pressable, Text, View } from '@symbiote-native/angular';
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from '@symbiote-native/crypto/angular';

@Component({
  standalone: true,
  imports: [Pressable, Text, View],
  template: `
    <View>
      <Text>UUID: {{ uuid() }}</Text>
      <Pressable (press)="handleHash()">
        <Text>Hash a string</Text>
      </Pressable>
      @if (hash()) {
        <Text>SHA-256: {{ hash() }}</Text>
      }
    </View>
  `,
})
export class CryptoScreen {
  readonly uuid = signal(randomUUID());
  readonly hash = signal('');

  handleHash(): void {
    digestStringAsync(CryptoDigestAlgorithm.SHA256, 'Confirm it is you').then(value =>
      this.hash.set(value),
    );
  }
}
```

There's no per-instance service to `inject()` in the Angular case — every function is a plain
free function off the core package.

## API

Free sync/async functions, no event stream, no per-instance state:

```ts
getRandomBytes(byteCount: number): Uint8Array
getRandomBytesAsync(byteCount: number): Promise<Uint8Array>
getRandomValues<T extends ITypedArray>(typedArray: T): T
randomUUID(): string
digestStringAsync(
  algorithm: CryptoDigestAlgorithm,
  data: string,
  options?: ICryptoDigestOptions,
): Promise<IDigest>
digest(algorithm: CryptoDigestAlgorithm, data: BufferSource): Promise<ArrayBuffer>
```

Plus `CryptoDigestAlgorithm` (`SHA1`/`SHA256`/`SHA384`/`SHA512`/`MD2`\*/`MD4`\*/`MD5`, \*iOS
only), `CryptoEncoding` (`HEX`/`BASE64`), `ICryptoDigestOptions`, `IDigest`, `ITypedArray` (and its
`IUintBasedTypedArray`/`IIntBasedTypedArray` halves), and the `CryptoError` validation-error class
— ported from upstream's `Crypto.types.ts`/`Crypto.ts`, renamed with this repo's `I`-prefix
convention for exported types (`ts-js-best-practices`).

```ts
import { digestStringAsync, randomUUID } from '@symbiote-native/crypto';
// or the framework-scoped entry points — identical surface, re-exported verbatim:
import { randomUUID } from '@symbiote-native/crypto/react';
import { randomUUID } from '@symbiote-native/crypto/vue';
import { randomUUID } from '@symbiote-native/crypto/angular';
```

## Notes

- `getRandomBytes`/`getRandomBytesAsync` validate `byteCount` is a number in `0`-`1024`
  (inclusive), throwing a plain `TypeError` otherwise, and floor a fractional count — matching
  upstream exactly. This port skips upstream's `__DEV__`/remote-debugger `Math.random` fallback:
  that's a React Native debugging-tool concern, not applicable to this package's native-call
  path.
- `digestStringAsync` validates `algorithm`/`data`/`options.encoding` and throws `CryptoError` (a
  `TypeError` subclass, `code: 'ERR_CRYPTO'`) on an invalid value — mirroring upstream's own
  `CryptoError`.
- `digest` prefers a native `digestAsync` when present; otherwise it allocates a fixed-size
  output buffer (sized via the `digestLengths` lookup table) and calls the sync native `digest`.

## Test it

No Fabric/Descriptor angle at all — every function here is a pure sync/async-function surface,
never a view or per-instance state. Tests inject a fake native-module object in place of the
real `requireNativeModule` resolution (`src/core/crypto.test.ts`, `vitest`) — no
`installFabric()`, no ViewConfig. Native rendering itself is verified on-device (see the parent
[README](../../README.md) for the project's testing model).

Native autolinking wiring is expected to land in the four Expo canary apps
(`examples/expo-react`, `examples/expo-vue-sfc`, `examples/expo-vue-tsx`, `examples/expo-angular`)
following the same recipe already proven for `@symbiote-native/local-auth`/`@symbiote-native/sensors`
— demo-screen wiring for this package is a follow-up, not part of this pass.
