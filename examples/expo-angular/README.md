# Angular Expo-modules canary (`@symbiote-native/angular` + expo-modules-core on device)

The Expo-native-modules demo home for the Angular adapter — sibling of
[`examples/angular`](../angular), which stays a "pure" SymbioteNative canary with zero
expo-modules-core dependency. This app owns the expo-modules-core native bootstrap (Podfile
autolinking, Gradle wiring, the `SymbioteExpoModulesFactory` iOS bring-up) and demos every
Expo-SDK-ported package as it lands: `@symbiote-native/sensors` today, `@symbiote-native/local-auth`
and others to follow. Otherwise it drives the same framework-agnostic
`@symbiote-native/engine` core through `@symbiote-native/angular`'s `Renderer2`/`RendererFactory2`,
with React Native's own renderer never in the path. See the
[Angular adapter README](../../adapters/angular) for the full surface and the AOT pipeline this
build script drives.

The app imports its standalone host intrinsics and composed components from the public
`@symbiote-native/angular` surface, then `ngc` compiles the app against the adapter's partial-Ivy
output. Angular uses a two-stage build pipeline:

1. `pnpm ng:build` runs `ngc -p tsconfig.angular.json` and emits partial-Ivy JS to
   `build/angular/`.
2. Metro loads `index.js`, which imports `build/angular/App.js`.
3. `babel.config.js` runs `@angular/compiler-cli/linker/babel` so Hermes receives
   full Ivy instructions.

## Run

```bash
pnpm install
# iOS
bundle install                 # first time only — installs CocoaPods itself
bundle exec pod install
pnpm dev                       # ngc --watch (background) + Metro (foreground); DEBUG=1 for logs
pnpm ios
# Android
pnpm android
```

## Test it

```bash
pnpm test                      # vitest, from the workspace root — headless, fake Fabric slot
pnpm e2e:build:ios             # ng:build, then build the app for Detox
pnpm e2e:test:ios              # run the canary journeys on the iOS simulator
# …or the android equivalents: e2e:build:android / e2e:test:android
```

## Note — its own native shell

Unlike the Vue examples (which copy `examples/react`'s native projects verbatim),
`examples/expo-angular` has its **own** separate `ios`/`android` native project (app identity
`CanaryExpo` / `com.canaryexpo`, distinct from `examples/angular`'s `Canary` / `com.canary`), so
it can run side-by-side with the other canaries on the same simulator without conflicting.
