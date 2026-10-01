# @symbiote-native/app-integrity

Let your backend tell your real app on a real device apart from a modified app, a script or an
emulator. One API for every [SymbioteNative](../../README.md) adapter (React, Vue, Svelte, Solid
and Angular).

It wraps [`@expo/app-integrity`](https://github.com/expo/expo/tree/main/packages/expo-app-integrity)
(Apple's App Attest, Google Play Integrity, and Android hardware-attested key generation). Like
[`@symbiote-native/application`](../application), everything here is a one-shot async call (or a
plain sync constant) with no per-instance state, so there is no hook, composable or service to
wrap: every adapter entry point is a plain re-export of the same `core`.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --app-integrity
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --app-integrity
```

Either way: installs `@symbiote-native/app-integrity` and wires the native autolinking
automatically, see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI, wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/app-integrity
```

`@expo/app-integrity` and `expo-modules-core` come along as regular dependencies, pinned to exact
versions. Never install either yourself, and never add the `expo` meta-package to your project
(it bundles its own Metro/Babel pipeline, which conflicts with this project's own).

## Required one-time step: native autolinking wiring

Unlike a plain RN native module, `@expo/app-integrity`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism. This needs wiring
into the native host app **once**, covering this package and every other `expo-modules-core`
package with zero further changes:

| Platform | Touches                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| iOS      | `ios/Podfile`, add `use_expo_modules!`                                                                                                           |
| iOS      | `AppDelegate.swift`, Expo's runtime-bootstrap hook                                                                                                |
| Android  | `settings.gradle` / `app/build.gradle`, resolve and include the Expo Gradle projects                                                              |
| Android  | `MainApplication.kt`, Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

Full mechanics live in the `symbiote-expo-native-module` project skill. Reference
implementation: `examples/expo-react/ios/Podfile` and
`examples/expo-react/android/app/src/main/java/com/canaryexpo/MainApplication.kt`.

No app-level permission strings are needed. App Attest, Play Integrity, and hardware attestation
are all system services with no user-facing permission prompt.

Each platform needs one setup step of its own: on iOS, add the **App Attest** capability in Xcode
(Signing & Capabilities; the app needs a registered App ID); on Android, enable the Play Integrity
API for your app and note your Google Cloud project number.

</details>

## Shape

```
src/core/     isSupported constant, generateKeyAsync / attestKeyAsync / generateAssertionAsync
              (App Attest, ios), prepareIntegrityTokenProviderAsync / requestIntegrityCheckAsync
              (Play Integrity, android), isHardwareAttestationSupportedAsync /
              generateHardwareAttestedKeyAsync / getAttestationCertificateChainAsync (hardware
              attestation, android). native-module.ts resolves the native module via
              expo-modules-core's requireNativeModule.
src/angular/  @symbiote-native/app-integrity/angular, export * from '../core'
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto `src/core/`,
no physical per-framework file, since there's nothing to subscribe to or clean up. `./angular`
stays a physical file/subpath since Angular ships through a separate `ngc`/AOT build (`build-ngc/`).

## API

```ts
isSupported: boolean // ios: real App Attest support; off ios: always true

generateKeyAsync(): Promise<string> // ios only
attestKeyAsync(keyId: string, challenge: string): Promise<string> // ios only
generateAssertionAsync(keyId: string, challenge: string): Promise<string> // ios only

prepareIntegrityTokenProviderAsync(cloudProjectNumber: string): Promise<void> // android only
requestIntegrityCheckAsync(requestHash: string): Promise<string> // android only

isHardwareAttestationSupportedAsync(): Promise<boolean> // android only, false elsewhere
generateHardwareAttestedKeyAsync(keyAlias: string, challenge: string): Promise<void> // android only
getAttestationCertificateChainAsync(keyAlias: string): Promise<string[]> // android only
```

```ts
import {
  generateKeyAsync,
  isSupported,
} from '@symbiote-native/app-integrity';
// or the framework-scoped entry points, identical surface, re-exported verbatim:
import { generateKeyAsync } from '@symbiote-native/app-integrity/react';
import { generateKeyAsync } from '@symbiote-native/app-integrity/vue';
import { generateKeyAsync } from '@symbiote-native/app-integrity/angular';
```

## Notes

- **Every function throws `UnavailabilityError` when called on the wrong platform** (an
  iOS-only App Attest function on Android, or an Android-only function on iOS), except
  `isHardwareAttestationSupportedAsync`, which resolves `false` instead, matching upstream.
- `isSupported` is a plain constant read once at import time from the native `Constant`, `true`
  on any non-iOS platform since App Attest has no Android/web equivalent to report on.
- The App Attest trio (`generateKeyAsync`/`attestKeyAsync`/`generateAssertionAsync`) is a
  three-step flow: generate a key, have Apple attest it once, then generate per-request
  assertions against the attested key. Send the attestation and each assertion to your own
  server for verification, this package only produces the client-side artifacts.
- `generateHardwareAttestedKeyAsync`/`getAttestationCertificateChainAsync` target the Android
  Keystore directly (works on GrapheneOS and other secure Android distributions), independent of
  Play Integrity's `prepareIntegrityTokenProviderAsync`/`requestIntegrityCheckAsync` pair.
- If the Android token provider is reused for too long, the next token request fails with
  `ERR_APP_INTEGRITY_PROVIDER_INVALID`. Call `prepareIntegrityTokenProviderAsync` again and retry.
- Verify on your server, never on the device: a check that runs only in the app can be bypassed by
  the clients you are guarding against. The canary `AppIntegrityScreen` in the `examples/expo-*`
  apps exercises every call.

## Common questions

- **`ERR_APP_INTEGRITY_PROVIDER_INVALID`.** The token provider expired; call
  `prepareIntegrityTokenProviderAsync` again.
- **Per-platform flow?** Android: Play Integrity Standard request (prepare once, token per action).
  iOS: App Attest key per user per device, attested once.
- **Enough alone?** No, verify the token on your server.

Sources: [Expo docs: AppIntegrity](https://docs.expo.dev/versions/latest/sdk/app-integrity/),
[Expo blog: Introducing Expo App Integrity](https://expo.dev/blog/expo-app-integrity).

## Test it

No Fabric/Descriptor angle at all, every export here is a one-shot async function or a plain
constant, never a view or per-instance state. Tests inject a fake native-module object in place
of the real `requireNativeModule` resolution (`src/core/app-integrity.test.ts`, `vitest`), no
`installFabric()`, no ViewConfig. Native behavior itself is verified on-device (see the parent
[README](../../README.md) for the project's testing model).
