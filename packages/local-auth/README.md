# @symbiote-native/local-auth

Port of [`expo-local-authentication`](https://docs.expo.dev/versions/latest/sdk/local-authentication/)
for [SymbioteNative](../../README.md) — FaceID/TouchID on iOS, the Fingerprint/Biometric API on
Android, reachable from every adapter (React, Vue, Angular), not just React.

Built the same way as [`@symbiote-native/sensors`](../sensors), an `expo-modules-core`-based
wrapper (see the `symbiote-expo-native-module` project skill for the full mechanism: why
`expo-modules-core` is depended on directly and never the `expo` meta-package, why the upstream
JS is hand-ported into `core/` rather than imported, and how autolinking picks up the native
module).

## API

Free functions, no event stream, no per-instance state — upstream ships a handful of async
functions and two enums, not a subscribable sensor, so the React/Vue/Angular entry points below
are plain re-exports of `core` with nothing adapter-specific to add.

```ts
hasHardwareAsync(): Promise<boolean>
supportedAuthenticationTypesAsync(): Promise<AuthenticationType[]>
isEnrolledAsync(): Promise<boolean>
getEnrolledLevelAsync(): Promise<SecurityLevel>
authenticateAsync(options?: ILocalAuthenticationOptions): Promise<ILocalAuthenticationResult>
cancelAuthenticate(): Promise<void> // Android only
```

Plus `AuthenticationType`, `SecurityLevel`, `ILocalAuthenticationOptions`,
`ILocalAuthenticationResult`, `ILocalAuthenticationError`, `IBiometricsSecurityLevel` — ported
from upstream's `LocalAuthentication.types.ts`, renamed with this repo's `I`-prefix convention
for exported types (`ts-js-best-practices`).

```ts
import { authenticateAsync, hasHardwareAsync } from '@symbiote-native/local-auth';
// or the framework-scoped entry points — identical surface, re-exported verbatim:
import { authenticateAsync } from '@symbiote-native/local-auth/react';
import { authenticateAsync } from '@symbiote-native/local-auth/vue';
import { authenticateAsync } from '@symbiote-native/local-auth/angular';
```

## Not yet done

- **Native example wiring.** `examples/react` already has a working `expo-modules-core`
  bring-up (Podfile monkeypatch + Android `settings.gradle` fallback, done for
  `@symbiote-native/sensors`) that auto-discovers any resolvable expo-modules-core package —
  adding this package needs only: (1) `expo-local-authentication` added to the Android
  `wantedExpoModules` allow-list in `examples/react/android/settings.gradle`, (2)
  `NSFaceIDUsageDescription` in `Info.plist` / `USE_BIOMETRIC` in `AndroidManifest.xml`. Both are
  small, but wait on a real published/canary build of this package first — `examples/react`
  resolves `@symbiote-native/*` by pinned version, not `workspace:*`.
- Tests exercise the JS layer only (fake native module, `vitest`) — no on-device/simulator smoke
  test yet.
