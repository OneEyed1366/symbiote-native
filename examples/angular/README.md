# Angular canary (`@symbiote-native/angular` on device)

The **M4 proof on a real host**: an Angular app driving the framework-agnostic
`@symbiote-native/engine` core through `@symbiote-native/angular`'s `Renderer2`/`RendererFactory2`,
with React Native's own renderer never in the path. It targets the same canary surface as
[`examples/react`](../react) and the Vue examples, standalone components, zoneless change
detection. See the [Angular adapter README](../../adapters/angular) for the full surface and the
AOT pipeline this build script drives.

The app imports its standalone host intrinsics and composed components from the public
`@symbiote-native/angular` surface, then `ngc` compiles the app against the adapter's partial-Ivy
output. Angular uses the two-stage Variant 1 build pipeline:

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
`examples/angular` has its **own** separate `ios`/`android` native project, so it can run
side-by-side with the other canaries on the same simulator without conflicting.
