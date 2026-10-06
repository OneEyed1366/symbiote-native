# @symbiote-native/apple-authentication

[`expo-apple-authentication`](https://docs.expo.dev/versions/latest/sdk/apple-authentication/) for
**every** [SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. Sign in
with Apple, iOS only: the credential flow and the system button.

## Install

```bash
npx @symbiote-native/cli new my-app --apple-authentication   # new app
npx @symbiote-native/cli add --apple-authentication          # existing app
```

Manual: `npm install @symbiote-native/apple-authentication`, then wire `expo-modules-autolinking`
once per app. Never install `expo-apple-authentication` or the `expo` meta-package yourself.

## Usage

```tsx
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  AppleAuthenticationScope,
  signInAsync,
} from '@symbiote-native/apple-authentication/react';

<AppleAuthenticationButton
  buttonType={AppleAuthenticationButtonType.SIGN_IN}
  buttonStyle={AppleAuthenticationButtonStyle.BLACK}
  cornerRadius={8}
  style={{ width: 200, height: 44 }}
  onPress={async () => {
    const credential = await signInAsync({
      requestedScopes: [AppleAuthenticationScope.FULL_NAME, AppleAuthenticationScope.EMAIL],
    });
  }}
/>;
```

The functions (`isAvailableAsync`, `signInAsync`, `refreshAsync`, `signOutAsync`,
`getCredentialStateAsync`, `formatFullName`, `addRevokeListener`) and the enums are the same on
every adapter, they live in the shared core. The button takes `onPress`, `buttonType`,
`buttonStyle`, `cornerRadius`, `style` and the View surface. It needs a width and a height, and it
renders nothing off iOS (with a dev-only warning).

## App setup

The package declares what `expo-apple-authentication`'s config plugin adds, and the
`expo-modules-link` postinstall writes it into the app:

| File               | Entry                                                        |
| ------------------ | ------------------------------------------------------------ |
| `Info.plist`       | `CFBundleAllowMixedLocalizations = true`, for the localized button |
| `*.entitlements`   | `com.apple.developer.applesignin = ['Default']`              |

When the app has no `*.entitlements` file the postinstall creates `<App>/<App>.entitlements` next to
`Info.plist` and wires it into the Xcode project. Pick a signing Team in Xcode once; Sign in with
Apple does not work without one.

## Not ported

Nothing: the web build and the config plugin itself are replaced by the manifest above. Upstream
ships no tests, so the suites here are written against its behavior.
