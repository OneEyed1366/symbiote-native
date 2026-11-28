# @symbiote-native/image

## 0.1.2

### Patch Changes

- [#107](https://github.com/OneEyed1366/symbiote-native/pull/107) [`a820567`](https://github.com/OneEyed1366/symbiote-native/commit/a82056755422000cbc4ff64a50b8d84231187add) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The native view wrappers accept `class` in their types on Solid and Svelte. The prop already reached
  the native view, so only `typecheck` rejected it. On Solid the components made by
  `defineDescriptorComponent`, `defineOptionalDescriptorComponent` and `defineNativeViewComponent`
  take it too.

  `IGLViewHandle` of `@symbiote-native/gl/svelte` now matches what `bind:this` gives: `getContextId()`
  in place of `exglCtxId`, which was never on the Svelte instance.

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

- Updated dependencies [[`a820567`](https://github.com/OneEyed1366/symbiote-native/commit/a82056755422000cbc4ff64a50b8d84231187add)]:
  - @symbiote-native/components@3.3.1

## 0.1.1

### Patch Changes

- Updated dependencies [[`8c2c5d6`](https://github.com/OneEyed1366/symbiote-native/commit/8c2c5d63dd9e980aae19b392c63d73f9929b103e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e)]:
  - @symbiote-native/components@3.3.0

## 0.1.0

### Minor Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/image`: `Image`, `ImageBackground` and `useImage` on React, Vue, Svelte, Solid and Angular (`ExpoImage`, `ExpoImageBackground`, `injectImage`), the cache and hash functions, and an `--image` layer in the CLI. React gains `descriptorToReactWithChildren`, which `LinearGradient` and `BlurView` now share.

### Patch Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `native-link.json` accepts `android.requiresKsp`. The linker then writes `kspVersion` into the app's root `android/build.gradle`, picked from Expo's KSP table for the app's Kotlin version, so `expo-image` and `expo-app-metrics` build without a hand-written line.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `styleOfProps` to the engine: the class and the inline style of a props bag in one list. `LinearGradient` on Android now rounds its native layer by a radius from a CSS class, and `Image` reads `resizeMode`, the Android background and the SF Symbol keys from a class, as it already did from `style`. `ImageBackground` gives `className` to its wrapping view, and `Image` takes a `VideoThumbnail` as a source. `VideoView`, `VideoAirPlayButton` and `AppleAuthenticationButton` accept `className` in React.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Bring the README of every Tier 3 and Tier 4 Expo package to the package README template, with per-adapter examples, API signatures and a Common questions section with cited sources. Correct the comment on `ICheckboxProps.color`: the grey disabled look is applied after it.

- Updated dependencies [[`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851)]:
  - @symbiote-native/components@3.2.0
