# @symbiote-native/constants

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-constants`](https://github.com/expo/expo/tree/main/packages/expo-constants), trimmed to its
native fields, usable from **every** adapter: React, Vue, Svelte, Solid and Angular. Every field is
a plain value resolved once from the native module, so there is no hook, composable or service to
wrap: each adapter entry point re-exports the same `core`.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --constants
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --constants
```

Either way it installs `@symbiote-native/constants` and wires the native autolinking, see
[`@symbiote-native/cli`](../cli). `expo-constants` and `expo-modules-core` come along as pinned
dependencies: never install either yourself and never add the `expo` meta-package.

Autolinking is the same one-time `expo-modules-core` setup every Expo wrapper needs, see the
`symbiote-expo-native-module` project skill. On Android the package also registers
`ConstantsService`, the native provider the module reads its values from: without it the module
resolves but every field is empty.

## Use it

```ts
import { Constants, ExecutionEnvironment } from '@symbiote-native/constants';

Constants.sessionId; // string, new on every app launch
Constants.statusBarHeight; // number
Constants.systemFonts; // string[]
Constants.linkingUri; // string
Constants.executionEnvironment === ExecutionEnvironment.Bare; // boolean
await Constants.getWebViewUserAgentAsync(); // string | null
```

`./react`, `./vue`, `./svelte` and `./solid` are `exports`-map aliases onto `src/core/`, and
`./angular` is a physical file only because Angular ships through a separate `ngc` build.

## API

`Constants` (`IConstants`): `appOwnership`, `debugMode`, `deviceName`, `deviceYearClass`,
`executionEnvironment`, `experienceUrl`, `expoRuntimeVersion`, `expoVersion`, `isDetached`,
`intentUri`, `isHeadless`, `linkingUri`, `sessionId`, `statusBarHeight`, `systemFonts`,
`systemVersion`, `supportedExpoSdks`, `platform` (`ios` with `buildNumber`, `platform`, `model`,
`userInterfaceIdiom`, `systemVersion`; `android` with `versionCode`) and `getWebViewUserAgentAsync()`.

Plus the enums `AppOwnership`, `ExecutionEnvironment` and `UserInterfaceIdiom`, and
`createConstants(nativeModule)`, the function `Constants` is built with.

## Not ported

- **The manifest family**: `manifest`, `manifest2`, `expoConfig`, `expoGoConfig` and `easConfig`.
  Upstream reads them from an app manifest that `expo-cli`, EAS or `expo-updates` generate, and
  this project has none. `createConstants` drops them even when the native module reports one.
- **`expo-updates` and dev-launcher manifest lookup**, for the same reason.
- **The web implementation** (`ExponentConstants.web.ts`) and the server entry, this project
  targets iOS and Android only.

The upstream tests all cover the manifest and are not ported, except its linking URI check, which
has a counterpart in `constants.test.ts`.

Because the manifest is missing, this package does not unlock `expo-auth-session`'s `auth.expo.io`
proxy flow or the scheme auto-detection of `makeRedirectUri`: both read `Constants.expoConfig`.

## Test it

Tests inject a fake native module in place of the real `requireNativeModule` resolution
(`src/core/constants.test.ts`, `vitest`), the same pattern as
[`@symbiote-native/application`](../application). Values on a real device are verified on-device.
