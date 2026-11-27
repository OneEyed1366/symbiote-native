# @symbiote-native/location

## 0.1.5

### Patch Changes

- [#107](https://github.com/OneEyed1366/symbiote-native/pull/107) [`a820567`](https://github.com/OneEyed1366/symbiote-native/commit/a82056755422000cbc4ff64a50b8d84231187add) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The Svelte adapter now drives Svelte's own custom renderer API (`svelte/renderer`) instead of DOM
  emulation. This needs `svelte >= 5.59.1` and the compiler option `experimental.customRenderer`, and
  the API is experimental in Svelte itself.

  `bind:`, `on:`, `transition:`, `animate:`, `{@html}` and `<svelte:window|document|body|head>` are now
  compile errors. Use `{@attach}` for element refs and `onX={...}` props for events.

  Svelte elements are now the engine's own nodes, so a `{@attach}` ref receives an engine node and the
  DOM-like element class is gone. A DOM-style action that calls `appendChild` or `remove` on its
  element no longer works, and a `use:portal` action from a community package breaks: use `Portal`.

  The engine now tells a style claim (the CSS animations of Reanimated) about an `animation*` style
  that follows a class made of claimed keys alone. Before, that style never reached `CSSManager`.

## 0.1.4

### Patch Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/location`, wrapping `expo-location` — foreground position, heading, geocoding, and motion activity, plus background location updates and geofencing registered as tasks through `@symbiote-native/task-manager`.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Rewrite the README of every Expo wrapper package around the problem it solves, and add a Common questions section with cited sources.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Backfill `native-link.json` fields a plugin-introspection audit sweep found missing against each wrapped `expo-*` package's own config plugin: `android.manifestPermissions` (brightness, cellular, haptics, local-auth, media-library, tracking-transparency), `android.mainActivityConfigChanges` (localization's locale/layoutDirection), and `ios.infoPlistKeys.UIUserInterfaceStyle` (system-ui, matching the vendor default). `location` also gains a signed-off `reviewedNonIntrospectableMods` entry for its no-op `dangerous` mod.

## 0.1.3

### Patch Changes

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/location`, wrapping `expo-location` — foreground position, heading, geocoding, and motion activity, plus background location updates and geofencing registered as tasks through `@symbiote-native/task-manager`.

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Rewrite the README of every Expo wrapper package around the problem it solves, and add a Common questions section with cited sources.

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Backfill `native-link.json` fields a plugin-introspection audit sweep found missing against each wrapped `expo-*` package's own config plugin: `android.manifestPermissions` (brightness, cellular, haptics, local-auth, media-library, tracking-transparency), `android.mainActivityConfigChanges` (localization's locale/layoutDirection), and `ios.infoPlistKeys.UIUserInterfaceStyle` (system-ui, matching the vendor default). `location` also gains a signed-off `reviewedNonIntrospectableMods` entry for its no-op `dangerous` mod.

## 0.1.2

### Patch Changes

- [`99fdbbb`](https://github.com/OneEyed1366/symbiote-native/commit/99fdbbb54b72d5d06cfd95fbf0d82f2d9fe17a6a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Force a clean republish of every publishable package. `engine@1.3.0`/`components@3.1.1` proved a
  missing changeset on a producer package can leave its published tarball silently behind its own
  source (see the `symbiote-release-publishing` skill's changeset-skips-callee gap) with no CI
  signal. A blanket patch here is the cheap way to rule out the same gap sitting anywhere else:
  every package rebuilds and republishes from current HEAD, and `updateInternalDependencies: patch`
  bumps every internal `workspace:*`/`workspace:^` pin along with it.

## 0.1.1

### Patch Changes

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/location`, wrapping `expo-location` — foreground position, heading, geocoding, and motion activity, plus background location updates and geofencing registered as tasks through `@symbiote-native/task-manager`.

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Backfill `native-link.json` fields a plugin-introspection audit sweep found missing against each wrapped `expo-*` package's own config plugin: `android.manifestPermissions` (brightness, cellular, haptics, local-auth, media-library, tracking-transparency), `android.mainActivityConfigChanges` (localization's locale/layoutDirection), and `ios.infoPlistKeys.UIUserInterfaceStyle` (system-ui, matching the vendor default). `location` also gains a signed-off `reviewedNonIntrospectableMods` entry for its no-op `dangerous` mod.
