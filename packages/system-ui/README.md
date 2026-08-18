# @symbiote-native/system-ui

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-system-ui`](https://github.com/expo/expo/tree/main/packages/expo-system-ui)
— setting and reading the root view's background color — usable from **every** adapter,
React, Vue, and Angular, not just React. Like
[`@symbiote-native/device`](../device) and [`@symbiote-native/local-auth`](../local-auth) and
unlike this repo's stateful Expo wrapper ([`@symbiote-native/sensors`](../sensors), an
`EventEmitter` + live-subscription surface), both exports here are one-shot async calls with no
per-instance state, so there is no hook/composable/service to wrap — the React, Vue, and
Angular entry points are plain re-exports of the same `core`.

## Install

```bash
npm install @symbiote-native/system-ui
```

`expo-system-ui` and `expo-modules-core` come along as regular dependencies, pinned to exact
versions — never install either yourself, and never add the `expo` meta-package to your project
(it bundles its own Metro/Babel pipeline, which conflicts with this project's own).

## Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-system-ui`'s native code is discovered by
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

`expo-system-ui` needs no runtime permission on either platform — it only sets/reads a stored
background color, nothing gated by a permission prompt.

## Shape

```
src/core/     setBackgroundColorAsync / getBackgroundColorAsync. native-module.ts resolves the
              native module via expo-modules-core's requireNativeModule.
src/angular/  @symbiote-native/system-ui/angular — export * from '../core'
```

`./react`, `./vue`, and `./svelte` are `exports`-map aliases straight onto `src/core/` — no
physical per-framework file, since there's nothing to subscribe to or clean up. `./angular` stays
a physical file/subpath since Angular ships through a separate `ngc`/AOT build (`build-ngc/`).

## Use it

```tsx
// React
import { setBackgroundColorAsync } from '@symbiote-native/system-ui/react';

setBackgroundColorAsync('black');
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { onMounted } from 'vue';
import { setBackgroundColorAsync } from '@symbiote-native/system-ui/vue';

onMounted(() => {
  void setBackgroundColorAsync('black');
});
</script>
```

```ts
// Angular
import { Component } from '@angular/core';
import { setBackgroundColorAsync } from '@symbiote-native/system-ui/angular';

@Component({ standalone: true, template: `` })
export class RootComponent {
  constructor() {
    void setBackgroundColorAsync('black');
  }
}
```

There's no per-instance service to `inject()` in the Angular case — both functions are plain
exports off the core package, called straight in the constructor or wherever the app's root is
set up. These snippets mirror the real canary demo screens —
`examples/expo-react/screens/SystemUiScreen.tsx`, `examples/expo-vue-sfc/screens/SystemUiScreen.vue`,
`examples/expo-vue-tsx/screens/SystemUiScreen.tsx`, `examples/expo-angular/src/screens/SystemUiScreen.ts`.

## API

Two one-shot async functions, no event stream, no per-instance state — so the React/Vue/Angular
entry points above are plain re-exports of `core` with nothing adapter-specific to add.

```ts
setBackgroundColorAsync(color: ColorValue | null): Promise<void>
getBackgroundColorAsync(): Promise<ColorValue | null>
```

```ts
import {
  getBackgroundColorAsync,
  setBackgroundColorAsync,
} from '@symbiote-native/system-ui';
// or the framework-scoped entry points — identical surface, re-exported verbatim:
import { setBackgroundColorAsync } from '@symbiote-native/system-ui/react';
import { setBackgroundColorAsync } from '@symbiote-native/system-ui/vue';
import { setBackgroundColorAsync } from '@symbiote-native/system-ui/angular';
```

## Notes

- **`setBackgroundColorAsync(null)` clears the override** rather than setting an actual color —
  it's passed straight through to the native module without running `processColor`.
- **On web, the raw `ColorValue` is passed through untouched** instead of being run through RN's
  `processColor` — matching upstream, since `processColor` is a native-color-parsing step that
  doesn't apply on that platform.
- **On iOS/Android, a non-null color is run through RN's own `processColor` before reaching the
  native module** — the same conversion RN's style pipeline uses internally.

## Test it

No Fabric/Descriptor angle at all — both exports here are one-shot async calls, never a view or
per-instance state. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/system-ui.test.ts`, `vitest`) — no `installFabric()`,
no ViewConfig. Native rendering itself is verified on-device (see the parent
[README](../../README.md) for the project's testing model).

Native autolinking wiring for `expo-modules-core` packages is already done in the four Expo
canary apps (`examples/expo-react`, `examples/expo-vue-sfc`, `examples/expo-vue-tsx`,
`examples/expo-angular`) via `@symbiote-native/local-auth`/`@symbiote-native/sensors` — this
package reuses that same wiring with zero further app-side changes, since
`expo-modules-autolinking` discovers any `expo-modules-core` package already present in
`node_modules`. A dedicated `SystemUiScreen` demo has not been wired into those canaries yet.
