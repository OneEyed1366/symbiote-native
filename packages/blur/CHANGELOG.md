# @symbiote-native/blur

## 0.1.0

### Minor Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/blur`: `BlurView` and `BlurTargetView` on React, Vue, Svelte, Solid and Angular, and a `--blur` layer in the CLI. The adapters gain shared bridges for native wrappers that take children (`DescriptorHost` on Angular and Svelte, a children argument on the Solid and Vue bridges), `hostNodeOf` on Angular and `hostInstance` on the Svelte native-view bridge. The engine accepts a view name in `expoViewManagerName` and warns when a static template tag cannot match it.

### Patch Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/image`: `Image`, `ImageBackground` and `useImage` on React, Vue, Svelte, Solid and Angular (`ExpoImage`, `ExpoImageBackground`, `injectImage`), the cache and hash functions, and an `--image` layer in the CLI. React gains `descriptorToReactWithChildren`, which `LinearGradient` and `BlurView` now share.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Bring the README of every Tier 3 and Tier 4 Expo package to the package README template, with per-adapter examples, API signatures and a Common questions section with cited sources. Correct the comment on `ICheckboxProps.color`: the grey disabled look is applied after it.

- Updated dependencies [[`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851)]:
  - @symbiote-native/components@3.2.0
