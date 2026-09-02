# Bare React Native baseline

Stock React Native — React's own Fabric renderer, RN's own `AppRegistry`, **zero
`@symbiote-native/*` in the dependency tree**. It runs the same benchmark screen the adapter
examples ([`react`](../react), [`vue-sfc`](../vue-sfc), [`svelte`](../svelte),
[`solid`](../solid), [`angular`](../angular)) run, so their numbers have something to be
measured against.

Adding any `@symbiote-native/*` dependency here voids the measurement — that is the one rule
this app has.

```
index.js                      AppRegistry.registerComponent(appName, () => App)
App.tsx                       the benchmark host
screens/BenchmarkScreen.tsx   the workload
components/                   JsFrameRateMeter, ActionButton
```

Versions (`react` 19.2.3, `react-native` 0.86.0, and the `@react-native/*` toolchain at
0.86.0) are pinned identically to [`examples/react`](../react) so a delta in the results is a
renderer delta, not a version delta.

## Run

`examples/*` is outside the pnpm workspace — plain `npm install`, from this directory, never
`pnpm install` from the repo root.

```sh
cd examples/bare-rn
npm install
# iOS
bundle install                 # first time only — installs CocoaPods itself
bundle exec pod install --project-directory=ios
npm start
npm run ios                    # npm run ios:release for a Release build
# Android
npm run android                # npm run android:release for a Release build
```

`npm run dev` starts Metro with `--reset-cache`.
