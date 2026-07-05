# @symbiote-native/splash-screen

A wrapper package for [SymbioteNative](../../README.md) that makes
[`react-native-bootsplash`](https://github.com/zoontek/react-native-bootsplash) usable from
**every** adapter — React, Vue, and Angular — not just React. Unlike a native-*view* wrapper
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
npx @symbiote-native/splash-screen generate <logo> [options]
```

A thin rebrand of `react-native-bootsplash`'s own generator — it writes native Android/iOS/web
project files (drawables, `colors.xml`, `LaunchScreen.storyboard`, `Info.plist`), independent of
which adapter the app uses. Zero reimplementation; run `--help` for the full flag list (`--brand`,
`--dark-*`, etc. — the multi-density/dark-mode addon flags require a paid `--license-key` from
the upstream author; pass it through as-is, this package doesn't attempt to replicate it).

## Out of scope

- The Expo config plugin (`app.plugin.js`, upstream's `/expo` entry) — this repo doesn't target
  Expo.
