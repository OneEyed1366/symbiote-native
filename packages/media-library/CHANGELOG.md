# @symbiote-native/media-library

## 0.1.1

### Patch Changes

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/media-library`, wrapping `expo-media-library` — both the shared-object `Query`/`Asset`/`Album` API and the legacy function-based API (`/legacy` subpath), usable from every adapter.

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Backfill `native-link.json` fields a plugin-introspection audit sweep found missing against each wrapped `expo-*` package's own config plugin: `android.manifestPermissions` (brightness, cellular, haptics, local-auth, media-library, tracking-transparency), `android.mainActivityConfigChanges` (localization's locale/layoutDirection), and `ios.infoPlistKeys.UIUserInterfaceStyle` (system-ui, matching the vendor default). `location` also gains a signed-off `reviewedNonIntrospectableMods` entry for its no-op `dangerous` mod.
