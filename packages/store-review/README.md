# @symbiote-native/store-review

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-store-review`](https://github.com/expo/expo/tree/main/packages/expo-store-review)
— prompting the platform's native in-app review flow — usable from **every** adapter, React,
Vue, and Angular, not just React. Like [`@symbiote-native/device`](../device) and
[`@symbiote-native/local-auth`](../local-auth), every export here is a one-shot async call with
no per-instance state, so there is no hook/composable/service to wrap — the React, Vue, and
Angular entry points are plain re-exports of the same `core`.

## Install

```bash
npm install @symbiote-native/store-review
```

`expo-store-review` and `expo-modules-core` come along as regular dependencies, pinned to exact
versions — never install either yourself, and never add the `expo` meta-package to your project
(it bundles its own Metro/Babel pipeline, which conflicts with this project's own).

## Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-store-review`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism — this needs wiring
into the native host app **once**, covering this package and every other `expo-modules-core`
package with zero further changes:

| Platform | Touches |
|---|---|
| iOS | `ios/Podfile` — add `use_expo_modules!` |
| iOS | `AppDelegate.swift` — Expo's runtime-bootstrap hook |
| Android | `settings.gradle` / `app/build.gradle` — resolve and include the Expo Gradle projects |
| Android | `MainApplication.kt` — Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

Full mechanics live in the `symbiote-expo-native-module` project skill. Reference
implementation: `examples/expo-react/ios/Podfile` and
`examples/expo-react/android/app/src/main/java/com/canaryexpo/MainApplication.kt`.

`expo-store-review` needs no runtime permission on either platform.

## Shape

```
src/core/     isAvailableAsync / requestReview / hasAction, plus the IStoreReviewUrlOptions
              type. native-module.ts resolves the native module via expo-modules-core's
              requireNativeModule.
src/react/    @symbiote-native/store-review/react   — export * from '../core'
src/vue/      @symbiote-native/store-review/vue     — export * from '../core'
src/angular/  @symbiote-native/store-review/angular — export * from '../core'
```

No per-adapter lifecycle wrapper exists because there's nothing to subscribe to or clean up —
each adapter entry is a single-file re-export.

## Use it

```tsx
// React
import { Button } from '@symbiote-native/react';
import { requestReview } from '@symbiote-native/store-review/react';

function RateAppButton() {
  return (
    <Button
      title="Rate this app"
      onPress={() =>
        requestReview({
          iosAppStoreUrl: 'https://apps.apple.com/app/id123456789',
          androidPlayStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.app',
        })
      }
    />
  );
}
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { Button } from '@symbiote-native/vue';
import { requestReview } from '@symbiote-native/store-review/vue';

function onRatePress() {
  void requestReview({
    iosAppStoreUrl: 'https://apps.apple.com/app/id123456789',
    androidPlayStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.app',
  });
}
</script>

<template>
  <Button title="Rate this app" @press="onRatePress" />
</template>
```

```ts
// Angular
import { Component } from '@angular/core';
import { Button } from '@symbiote-native/angular';
import { requestReview } from '@symbiote-native/store-review/angular';

@Component({
  standalone: true,
  imports: [Button],
  template: `<Button title="Rate this app" (press)="onRatePress()" />`,
})
export class RateAppButton {
  onRatePress(): void {
    void requestReview({
      iosAppStoreUrl: 'https://apps.apple.com/app/id123456789',
      androidPlayStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.app',
    });
  }
}
```

These snippets are not yet demoed in a real canary screen — treat them as realistic reference
code, not a trimmed-down copy of a running demo.

## API

```ts
export type IStoreReviewUrlOptions = {
  iosAppStoreUrl?: string;
  androidPlayStoreUrl?: string;
};

isAvailableAsync(): Promise<boolean>
requestReview(options?: IStoreReviewUrlOptions): Promise<void>
hasAction(options?: IStoreReviewUrlOptions): Promise<boolean>
```

```ts
import { requestReview, isAvailableAsync, hasAction } from '@symbiote-native/store-review';
// or the framework-scoped entry points — identical surface, re-exported verbatim:
import { requestReview } from '@symbiote-native/store-review/react';
import { requestReview } from '@symbiote-native/store-review/vue';
import { requestReview } from '@symbiote-native/store-review/angular';
```

## Notes

- **Deliberate deviation from upstream — no `expo-constants` dependency.** Upstream's
  `storeUrl()` reads `Constants.expoConfig.ios.appStoreUrl`/`.android.playStoreUrl` off
  `expo-constants`, which requires an Expo-CLI-generated manifest (`app.config`/EAS/updates)
  this bare, Metro-only project never produces (see the `symbiote-expo-package-catalog` skill,
  row 9 — `expo-constants` was skipped for exactly this reason). So this port trims that surface:
  every function that would have read the manifest instead takes an optional
  `IStoreReviewUrlOptions` argument (`iosAppStoreUrl` / `androidPlayStoreUrl`), and the caller
  supplies the store URL explicitly instead of it being resolved from `app.json`/`app.config.js`.
  There is no standalone `storeUrl()` export — its logic lives inline as a private helper,
  since it now takes the same options argument every public function does.
- **`requestReview()` prefers the native in-app review flow** (iOS `SKStoreReviewController`,
  Android's Play Core in-app review API) and only falls back to opening the supplied store URL
  via `Linking` when the native flow is unavailable — matching upstream's own fallback order.
- **A missing URL on the fallback path logs a warning, never throws** — matching upstream's own
  `console.warn`-and-continue behavior, just with different wording (pointing at the
  `IStoreReviewUrlOptions` argument instead of `app.json`).

## Test it

No Fabric/Descriptor angle at all — every export here is a pure async-function surface, never a
view or per-instance state. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution, plus a stubbed `expo-modules-core` `Platform` and a stubbed
`react-native` `Linking` (`src/core/store-review.test.ts`, `vitest`) — no `installFabric()`, no
ViewConfig. Native rendering itself is verified on-device (see the parent
[README](../../README.md) for the project's testing model).

Native autolinking wiring for `expo-modules-core` packages is already done in the four Expo
canary apps (`examples/expo-react`, `examples/expo-vue-sfc`, `examples/expo-vue-tsx`,
`examples/expo-angular`) via `@symbiote-native/local-auth`/`@symbiote-native/sensors` — this
package reuses that same wiring with zero further app-side changes, since
`expo-modules-autolinking` discovers any `expo-modules-core` package already present in
`node_modules`. A dedicated demo screen has not been wired into those canaries yet.
