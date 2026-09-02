# @symbiote-native/splash-screen

A wrapper package for [SymbioteNative](../../README.md) that makes
[`react-native-bootsplash`](https://github.com/zoontek/react-native-bootsplash) usable from
**every** adapter — React, Vue, Svelte, Solid, and Angular — not just React. Unlike a native-_view_ wrapper
(see `@symbiote-native/slider`), bootsplash exposes an imperative TurboModule (`hide`/`isVisible`)
plus a React hook (`useHideAnimation`) that composes a fade-out overlay from plain `View`/`Image`
primitives — there is no `ViewConfig` to register, only lifecycle to port per adapter.

## Install

```bash
npm install @symbiote-native/splash-screen
```

Only this package — never `react-native-bootsplash` directly. `@symbiote-native/splash-screen`
depends on it and ships as the sole autolinked native proxy (`react-native.config.cjs` +
`symbiote-splash-screen.podspec`), the same one-dependency packaging as `@symbiote-native/slider`
(see the `symbiote-third-party-native-view` skill).

## Shape

```
src/core/       hide()/isVisible() (re-exported as-is — zero React upstream), the readiness-gate
                HideAnimationController, and computeHideAnimationStyles: a faithful port of
                react-native-bootsplash's useHideAnimation body, framework-agnostic
src/react/      @symbiote-native/splash-screen/react   — useHideAnimation hook
src/vue/        @symbiote-native/splash-screen/vue     — useHideAnimation composable
src/svelte/     @symbiote-native/splash-screen/svelte  — useHideAnimation rune
src/solid/      @symbiote-native/splash-screen/solid   — createHideAnimation primitive (Solid
                reserves `use*` for consuming existing state)
src/angular/    @symbiote-native/splash-screen/angular — HideAnimationService (signals)
```

`hide()`/`isVisible()` are re-exported straight from `react-native-bootsplash` since the upstream
functions already have zero React dependency. `useHideAnimation` returns `{ container, logo,
brand }` prop bags the app binds to its own `View`/`Image` — the same contract upstream ships,
kept identical across adapters (Angular's service returns the same three values as Signals).

## Required manual step: wiring the native init call

The upstream asset generator (see below) does **not** automate this — you must add it yourself,
in every app that uses this package:

**iOS** — `ios/YourApp/AppDelegate.swift`, inside `customize(_ rootView:)`:

```swift
import RNBootSplash

override func customize(_ rootView: RCTRootView) {
  super.customize(rootView)
  RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)
}
```

**Android** — `android/app/src/main/java/.../MainActivity.kt`, inside `onCreate`:

```kotlin
import com.zoontek.rnbootsplash.RNBootSplash

override fun onCreate(savedInstanceState: Bundle?) {
  RNBootSplash.init(this, R.style.BootTheme)
  super.onCreate(savedInstanceState)
}
```

Skipping this step means the native splash is never shown, and `hide()`/`useHideAnimation` have
nothing to hide.

## Asset generation CLI

```bash
npx symbiote-splash-screen generate <logo> [options]
```

A thin rebrand of `react-native-bootsplash`'s own generator (`bin: symbiote-splash-screen`,
spawned as a child process of its real `cli.js` since that script sits outside upstream's
`exports` map) — it writes native Android/iOS/web project files (drawables, `styles.xml`'s
`Theme.BootSplash`, `LaunchScreen.storyboard`, `Info.plist`'s launch-screen key) plus
`assets/bootsplash/manifest.json` (the same shape `IManifest` expects: `background`,
`logo.{width,height}`, optional `darkBackground`/`brand`), independent of which adapter the app
uses. Zero reimplementation; run `--help` for the full flag list (`--brand`, `--dark-*`, etc. —
the multi-density/dark-mode addon flags require a paid `--license-key` from the upstream author;
pass it through as-is, this package doesn't attempt to replicate it).

## Use it

`hide()` is the simple case — call it once your JS tree has mounted:

```tsx
// React — examples/react/App.tsx
import { hide } from '@symbiote-native/splash-screen/react';

useEffect(() => {
  hide();
}, []);
```

```vue
<!-- Vue — examples/vue-sfc/App.vue -->
<script setup lang="ts">
import { onMounted } from 'vue';
import { hide } from '@symbiote-native/splash-screen/vue';

onMounted(() => hide());
</script>
```

```ts
// Angular — examples/angular/App.ts
import { hide } from '@symbiote-native/splash-screen/angular';
// call once from the root component's constructor/ngOnInit.
```

```svelte
<!-- Svelte — examples/svelte/App.svelte -->
<script lang="ts">
  import { hide } from '@symbiote-native/splash-screen/svelte';

  $effect(() => {
    hide();
  });
</script>
```

```tsx
// Solid
import { onMount } from 'solid-js';
import { hide } from '@symbiote-native/splash-screen/solid';

onMount(() => void hide());
```

For a fade transition gated on real readiness (layout committed + logo/brand images loaded +
your own `ready` flag) instead of an immediate `hide()`, use `useHideAnimation` — it returns the
same `{ container, logo, brand }` prop bags upstream's hook does, which you bind onto your own
`View`/`Image`:

```tsx
import { useHideAnimation } from '@symbiote-native/splash-screen/react';
import manifest from '../assets/bootsplash/manifest.json';

const { container, logo } = useHideAnimation({
  manifest,
  logo: require('../assets/bootsplash/logo.png'),
  animate: () => {
    /* your own fade-out, e.g. an Animated.timing to opacity 0 */
  },
});
```

See the docs-site package page (`docs/packages/splash-screen`) for the full config surface and
the Vue/Svelte/Solid/Angular equivalents.

## API

The core entry point (`@symbiote-native/splash-screen`) is framework-agnostic — `hide`/`isVisible`
re-exported verbatim from `react-native-bootsplash`, plus the readiness gate and style computation
each adapter's lifecycle wrapper drives:

```ts
hide(config?: IHideConfig): Promise<void>              // dismisses the native splash, optional fade
isVisible(): boolean                                    // is the native splash still up
getHideAnimationConstants(): IHideAnimationConstants    // darkModeEnabled + logo/status-bar/nav-bar metrics,
                                                        // read off the RNBootSplash native module
new HideAnimationController(config: IHideAnimationConfig)
// readiness gate — onContainerLayout / onLogoLoadEnd / onBrandLoadEnd / updateConfig(config);
// hide() fires exactly once, after layout + both images + the caller's own `ready` all report in.
computeHideAnimationStyles(config, constants, controller): IHideAnimationResult
// the { container, logo, brand } prop bags, recomputed from the current config.
```

Plus `IHideConfig`, `IManifest`, `IHideAnimationConfig`, `IHideAnimationContainerProps`,
`IHideAnimationImageProps`, `IHideAnimationResult`, `IHideAnimationConstants`.

Each adapter entry point re-exports `hide`/`isVisible` (and the `IHideConfig`/`IManifest`/
`IHideAnimationConfig`/`IHideAnimationResult` types) unchanged, and adds one lifecycle wrapper
over the controller — the only per-framework difference is how the config is read:

```ts
// @symbiote-native/splash-screen/react — re-runs every render, so a plain value
useHideAnimation(config: IHideAnimationConfig): IHideAnimationResult

// @symbiote-native/splash-screen/vue — setup runs once, so a getter
useHideAnimation(getConfig: () => IHideAnimationConfig): ComputedRef<IHideAnimationResult>

// @symbiote-native/splash-screen/svelte — the script body runs once, so a getter
useHideAnimation(getConfig: () => IHideAnimationConfig): { readonly current: IHideAnimationResult }

// @symbiote-native/splash-screen/solid — the component body runs once, so an accessor
createHideAnimation(config: Accessor<IHideAnimationConfig>): Accessor<IHideAnimationResult>

// @symbiote-native/splash-screen/angular — inject(HideAnimationService), connect() once
connect(getConfig: () => IHideAnimationConfig): Signal<IHideAnimationResult>
```

## Test it

Headless lifecycle-wrapper tests live next to each adapter entry
(`src/{react,vue,svelte,solid}/{hooks,composables,runes,primitives}/*hide-animation*.test.{ts,tsx}`) and mock
`react-native-bootsplash`'s `hide`/`isVisible` plus a fake `__turboModuleProxy` for
`getConstants()`, so they run without a real Fabric host. Native asset generation and the
Android/iOS wiring above are verified on-device (see the parent [README](../../README.md) for the
project's testing model).

## Out of scope

- The Expo config plugin (`app.plugin.js`, upstream's `/expo` entry) — this repo doesn't target
  Expo.
