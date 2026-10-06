# @symbiote-native/apple-authentication

[`expo-apple-authentication`](https://docs.expo.dev/versions/latest/sdk/apple-authentication/) for
**every** [SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. Sign in
with Apple, iOS only: the credential flow and the system button.

Built the same way as [`@symbiote-native/clipboard`](../clipboard)'s `ClipboardPasteButton`, an
`expo-modules-core` native view reached through `requireNativeViewManager` (see the
`symbiote-expo-native-module` project skill: why `expo-modules-core` is depended on directly and never
the `expo` meta-package, why the upstream JS is hand-ported into `core/`, and how autolinking finds the
native module). The credential flow is plain async functions in `core/`, the button is the one render function every
adapter turns into its own element.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --apple-authentication
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --apple-authentication
```

Either way: installs `@symbiote-native/apple-authentication` and wires the native autolinking automatically,
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/apple-authentication
```

Depends on `expo-apple-authentication` and `expo-modules-core` directly (regular dependencies, pinned to exact
versions, since this package's `core/` is hand-ported against one specific native API shape).
Never install `expo-apple-authentication` yourself, and never add the `expo` package to this project: it bundles
its own Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

`expo-apple-authentication`'s native code is discovered by `expo-modules-autolinking`, not by RN's own
`react-native.config.cjs` mechanism. Wire it into the native host app **once**, it covers this package
and every other `expo-modules-core` package with zero further changes. The steps and the
mechanics behind them are in the `symbiote-expo-native-module` skill and in
[`@symbiote-native/network`](../network)'s README; the reference app is `examples/expo-react`.

### Entitlement and Info.plist

The package declares what `expo-apple-authentication`'s config plugin adds, and the `expo-modules-link`
postinstall writes it into the app:

| File               | Entry                                                          |
| ------------------ | -------------------------------------------------------------- |
| `Info.plist`       | `CFBundleAllowMixedLocalizations = true`, for the localized button |
| `*.entitlements`   | `com.apple.developer.applesignin = ['Default']`                |

When the app has no `*.entitlements` file the postinstall creates `<App>/<App>.entitlements` next to
`Info.plist` and wires it into the Xcode project. Pick a signing Team in Xcode once; Sign in with
Apple does not work without one.

</details>

## Shape

```
src/core/                apple-authentication.ts - isAvailableAsync, signInAsync, refreshAsync,
                         signOutAsync, getCredentialStateAsync, formatFullName, addRevokeListener over
                         requireOptionalNativeModule with a stub. apple-authentication-button.ts - the
                         button descriptor. types.ts - enums and credential types.
src/react/               @symbiote-native/apple-authentication/react   - AppleAuthenticationButton
src/vue/                 @symbiote-native/apple-authentication/vue     - AppleAuthenticationButton
src/svelte/              @symbiote-native/apple-authentication/svelte  - AppleAuthenticationButton
src/solid/               @symbiote-native/apple-authentication/solid   - AppleAuthenticationButton
src/angular/             @symbiote-native/apple-authentication/angular - AppleAuthenticationButton
```

The functions and the enums are the same on every adapter, they live in the shared core. Off iOS the
native module is missing, so the functions throw `UnavailabilityError` instead of crashing at import.

## Use it

### React

```tsx
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  signInAsync,
} from '@symbiote-native/apple-authentication/react';

<AppleAuthenticationButton
  buttonType={AppleAuthenticationButtonType.SIGN_IN}
  buttonStyle={AppleAuthenticationButtonStyle.BLACK}
  cornerRadius={8}
  style={{ width: 200, height: 44 }}
  onPress={() => signInAsync()}
/>;
```

### Vue

```vue
<script setup lang="ts">
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  signInAsync,
} from '@symbiote-native/apple-authentication/vue';
</script>

<template>
  <AppleAuthenticationButton
    :button-type="AppleAuthenticationButtonType.SIGN_IN"
    :button-style="AppleAuthenticationButtonStyle.BLACK"
    :corner-radius="8"
    :style="{ width: 200, height: 44 }"
    :on-press="() => signInAsync()"
  />
</template>
```

### Angular

```ts
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  signInAsync,
} from '@symbiote-native/apple-authentication/angular';

@Component({
  imports: [AppleAuthenticationButton],
  template: `
    <AppleAuthenticationButton
      [buttonType]="type"
      [buttonStyle]="style"
      [cornerRadius]="8"
      [onPress]="signIn"
    />
  `,
})
export class SignIn {
  readonly type = AppleAuthenticationButtonType.SIGN_IN;
  readonly style = AppleAuthenticationButtonStyle.BLACK;
  readonly signIn = () => signInAsync();
}
```

### Svelte

```svelte
<script lang="ts">
  import {
    AppleAuthenticationButton,
    AppleAuthenticationButtonStyle,
    AppleAuthenticationButtonType,
    signInAsync,
  } from '@symbiote-native/apple-authentication/svelte';
</script>

<AppleAuthenticationButton
  buttonType={AppleAuthenticationButtonType.SIGN_IN}
  buttonStyle={AppleAuthenticationButtonStyle.BLACK}
  cornerRadius={8}
  style={{ width: 200, height: 44 }}
  onPress={() => signInAsync()}
/>
```

### Solid

```tsx
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  signInAsync,
} from '@symbiote-native/apple-authentication/solid';

<AppleAuthenticationButton
  buttonType={AppleAuthenticationButtonType.SIGN_IN}
  buttonStyle={AppleAuthenticationButtonStyle.BLACK}
  cornerRadius={8}
  style={{ width: 200, height: 44 }}
  onPress={() => signInAsync()}
/>;
```

## API

```ts
isAvailableAsync(): Promise<boolean>                          // false off iOS
signInAsync(options?): Promise<AppleAuthenticationCredential> // rejects ERR_REQUEST_CANCELED on cancel
refreshAsync(options): Promise<AppleAuthenticationCredential>
signOutAsync(options): Promise<AppleAuthenticationCredential>
getCredentialStateAsync(user): Promise<AppleAuthenticationCredentialState>   // not on the Simulator
formatFullName(fullName, formatStyle?): string
addRevokeListener(listener): EventSubscription

<AppleAuthenticationButton onPress buttonType buttonStyle cornerRadius? style? />   // needs width and height
```

Plus the `AppleAuthenticationScope`, `AppleAuthenticationButtonType`, `AppleAuthenticationButtonStyle`,
`AppleAuthenticationOperation` and `AppleAuthenticationCredentialState` enums and the `I`-prefixed
credential types, hand-ported from upstream's `AppleAuthentication.types.ts`.

## Notes

- **iOS only.** Off iOS `isAvailableAsync()` resolves `false`, every other function throws
  `UnavailabilityError`, and the button renders nothing with a warning in development. Gate the
  button on `isAvailableAsync()`.
- **Cancelling is an error with a code.** `signInAsync` and `refreshAsync` reject with
  `ERR_REQUEST_CANCELED` when the user dismisses the sheet. Any other code is a real failure.
- **A credential without tokens is a failure.** If the result lacks `authorizationCode`,
  `identityToken` or `user`, the call rejects with `ERR_REQUEST_FAILED`, so a resolved credential is
  always usable.
- **Name and email arrive once.** Apple returns `fullName` and `email` only the first time a user
  signs in to your app, and only for the scopes you requested. Store them when you get them, for
  example with [`@symbiote-native/secure-store`](/docs/packages/secure-store/) or on your server.
- **The button label is drawn by iOS.** You pick `buttonType` and `buttonStyle`, the text follows the
  app's localization, and the package sets `CFBundleAllowMixedLocalizations` for it.
- **Not ported.** Nothing: the web build and the config plugin itself are replaced by the manifest above. Upstream ships no tests, so the suites here are written against its behavior.

## Common questions

- **The button does not show up.** Give it a width and a height and render it only when
  `isAvailableAsync()` resolves `true`. Check the entitlement and the signing Team.
- **Spins forever on the Simulator.** An Apple simulator bug, test on a real device.
  `getCredentialStateAsync` always throws on the simulator.
- **`ERR_REQUEST_FAILED` with error 1000 on a device.** Enable the capability for the App ID,
  regenerate the provisioning profile, select a Team, keep `com.apple.developer.applesignin` in the
  entitlements.
- **Cancel or failure.** A cancel rejects with `ERR_REQUEST_CANCELED`, anything else is a failure.
- **`fullName` and `email` are `null` the second time.** Apple returns them only on the first sign
  in, store them.
- **Button text.** Drawn by iOS from the app's localizations, not settable from JavaScript.
- **Firebase `aud` mismatch.** `host.exp.Exponent` only appears in Expo Go. Builds use your own
  bundle identifier.
- **Android and web.** Not supported, the functions throw `UnavailabilityError`.

Sources: [Expo docs: AppleAuthentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/),
[expo/expo#11476](https://github.com/expo/expo/issues/11476),
[expo/expo#5781](https://github.com/expo/expo/issues/5781),
[expo/expo#8341](https://github.com/expo/expo/issues/8341),
[expo/expo#5690](https://github.com/expo/expo/issues/5690),
[expo/expo#7129](https://github.com/expo/expo/issues/7129),
[expo/expo#16162](https://github.com/expo/expo/issues/16162).

## Test it

No device is needed for the logic. The core tests (`src/core/*.test.ts`) replace `expo-modules-core`
(the native module and `requireNativeViewManager`) and assert the descriptor a render function returns. The
adapter tests (`src/{react,vue,solid,angular}/**/*.test.*`, `vitest`) render the real component over the
recording Fabric with an injected view config and assert the committed payload, and Svelte's
`*.smoke.test.ts` compile the `.svelte` files and mount them. Painting itself is verified on a device in
the six `examples/expo-*` canary apps (`examples/expo-react`, `examples/expo-vue-sfc`,
`examples/expo-vue-tsx`, `examples/expo-svelte`, `examples/expo-solid`, `examples/expo-angular`), see the
parent [README](../../README.md).
