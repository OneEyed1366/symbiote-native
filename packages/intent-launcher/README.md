# @symbiote-native/intent-launcher

Send the user to the right system screen: Wi-Fi settings when the network is off, your app's own
permission page after a denied prompt, or straight into another app. One API for every
[SymbioteNative](../../README.md) adapter (React, Vue, Svelte, Solid and Angular).

It wraps [`expo-intent-launcher`](https://github.com/expo/expo/tree/main/packages/expo-intent-launcher)
(launching an Android intent and reading another app's icon). **Android only**: upstream ships no
iOS implementation, so every function throws `UnavailabilityError` off Android, matching upstream's
own guard. Built the same way as [`@symbiote-native/print`](../print): an `expo-modules-core`-based
wrapper (see the `symbiote-expo-native-module` project skill for the full mechanism).

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --intent-launcher
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --intent-launcher
```

Either way: installs `@symbiote-native/intent-launcher` and wires the native autolinking
automatically, see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI, wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/intent-launcher
```

`expo-intent-launcher` and `expo-modules-core` come along as regular, pinned dependencies, never
install either yourself, and never add the `expo` meta-package to this project (it bundles its
own Metro/Babel pipeline that conflicts with this project's own).

### Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-intent-launcher`'s native code is discovered by
`expo-modules-autolinking`, wired into the native host app **once**, covering this package and
every other `expo-modules-core` package with zero further changes. Full mechanics live in the
`symbiote-expo-native-module` skill.

### No permissions, no config plugin

- **No runtime permission.** Starting an activity or reading another app's icon needs no grant.
- **No manifest edit.** `expo-intent-launcher`'s own `AndroidManifest.xml` declares nothing.
- **No config plugin.** Upstream ships none, a clean `native-link.json` with only the Android
  module entry is the whole file.

</details>

## Shape

```
src/core/                 startActivityAsync + openApplication + getApplicationIconAsync,
                          ActivityAction (Android Settings actions) + ResultCode. The native
                          module resolution is Android-only (native-module/index.android.ts);
                          the base native-module/index.ts is an empty stub, same as upstream's
                          own non-Android ExpoIntentLauncher.ts
src/angular/              @symbiote-native/intent-launcher/angular
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto `src/core/`,
every export here is a stateless free function, an enum, or a plain type, nothing to wrap.
`./angular` stays a physical file/subpath since Angular ships through a separate `ngc`/AOT build
(`build-ngc/`).

## Use it

```ts
import { ActivityAction, startActivityAsync } from '@symbiote-native/intent-launcher';

await startActivityAsync(ActivityAction.WIFI_SETTINGS);
```

```ts
import { getApplicationIconAsync, openApplication } from '@symbiote-native/intent-launcher';

openApplication('com.google.android.gm');
const icon = await getApplicationIconAsync('com.google.android.gm');
```

## API

| Export | Signature | Notes |
| --- | --- | --- |
| `startActivityAsync` | `(activityAction: ActivityAction \| string, params?: IIntentLauncherParams) => Promise<IIntentLauncherResult>` | Resolves once the user returns to this app |
| `openApplication` | `(packageName: string) => void` | Fire-and-forget |
| `getApplicationIconAsync` | `(packageName: string) => Promise<string>` | Base64 PNG, `data:image/png;base64,...` |
| `ActivityAction` | `enum` | Android's own Settings-provider action constants |
| `ResultCode` | `enum` | `Success = -1`, `Canceled = 0`, `FirstUser = 1` |

## Notes

- **`startActivityAsync` resolves when the user comes back.** The result code says whether they
  finished or cancelled; do not assume the setting changed.
- **`extra`'s type is `Record<string, unknown>`**, not upstream's `Record<string, any>`, this
  repo bans `any` in application code. The field is forwarded verbatim to the native module, so
  narrowing it further would need a schema this package doesn't have a use for yet.

## Common questions

- **`ActivityNotFoundException`.** No app handles the intent; wrap the call in `try`/`catch`.
- **`packageName` without `className`.** The intent is restricted to that package and rejects if it
  cannot handle it.
- **Crash returning from notification settings.** Reported with `APP_NOTIFICATION_SETTINGS` plus an `extra`.
- **`ERR_UNAVAILABLE`.** Reported with `enableDangerousExperimentalLeanBuilds`.

Sources: [expo/expo#12078](https://github.com/expo/expo/pull/12078),
[expo/expo#50511](https://github.com/expo/expo/pull/50511),
[expo/expo#22995](https://github.com/expo/expo/issues/22995).

## Test it

```bash
pnpm vitest run packages/intent-launcher
```

The core tests fake the native module in place of `requireNativeModule`'s runtime resolution,
`ExpoIntentLauncher` only exists on a real Android device, so a headless run would otherwise
throw at import. Upstream ships no test suite of its own, so nothing to port, every test here
is net-new coverage of the ported logic (the guard-clause validation, the three
`UnavailabilityError` branches).
