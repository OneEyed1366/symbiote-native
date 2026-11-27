# @symbiote-native/reanimated

## 0.1.1

### Patch Changes

- [#107](https://github.com/OneEyed1366/symbiote-native/pull/107) [`a820567`](https://github.com/OneEyed1366/symbiote-native/commit/a82056755422000cbc4ff64a50b8d84231187add) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `useScrollOffset` on Vue, Svelte, Solid and Angular no longer warns about an uninitialized ref
  when its view arrives right after setup. A ref that still has no view a turn later is reported.

- [#107](https://github.com/OneEyed1366/symbiote-native/pull/107) [`a820567`](https://github.com/OneEyed1366/symbiote-native/commit/a82056755422000cbc4ff64a50b8d84231187add) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `engine` adds `registerPreCommit` and `unregisterPreCommit`: a hook that runs as a commit starts, so
  what it writes still rides that commit.

  A view under `LayoutAnimationConfig` with `skipEntering` no longer leaves an entering config in the
  native store, which native never released. It also gets no `nativeID` for it, so it can flatten.

  On Angular, `skipEnteringExitingAnimations` and `skipEntering` could miss rows that a render had
  read before the scope had its props. They are skipped now.

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

## 0.1.0

### Minor Changes

- [#96](https://github.com/OneEyed1366/symbiote-native/pull/96) [`c23cef9`](https://github.com/OneEyed1366/symbiote-native/commit/c23cef9da297442d2faf32f96ccf2d651b3a8b1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `@symbiote-native/reanimated` carries the whole export list of react-native-reanimated 4.7.1 and react-native-worklets 0.13 for Vue, Svelte, Solid and Angular, next to React. Each adapter has the same hooks, `Animated` components, layout animations and CSS animation callbacks.

### Patch Changes

- [`8c2c5d6`](https://github.com/OneEyed1366/symbiote-native/commit/8c2c5d63dd9e980aae19b392c63d73f9929b103e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Comments and READMEs no longer point at project skills that were removed.

- [#96](https://github.com/OneEyed1366/symbiote-native/pull/96) [`c23cef9`](https://github.com/OneEyed1366/symbiote-native/commit/c23cef9da297442d2faf32f96ccf2d651b3a8b1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A bare `view`, `text` or `image` takes an animated style and the CSS animation keys in `style`, in every adapter. The Svelte `Animated.FlatList` keeps its item type in an app's type check, and the Svelte entry gets its types from the built declarations.

- [#96](https://github.com/OneEyed1366/symbiote-native/pull/96) [`c23cef9`](https://github.com/OneEyed1366/symbiote-native/commit/c23cef9da297442d2faf32f96ccf2d651b3a8b1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The published package leaves out the `.detox` test files, and its npm keywords name the five adapters like every other package.

- [#96](https://github.com/OneEyed1366/symbiote-native/pull/96) [`c23cef9`](https://github.com/OneEyed1366/symbiote-native/commit/c23cef9da297442d2faf32f96ccf2d651b3a8b1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The README says the package was checked on an iOS simulator and on Android in all five adapters.

- [#96](https://github.com/OneEyed1366/symbiote-native/pull/96) [`c23cef9`](https://github.com/OneEyed1366/symbiote-native/commit/c23cef9da297442d2faf32f96ccf2d651b3a8b1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The package starts at version 0.0.0, so the first trusted-publisher run publishes a placeholder and the first release comes from the changesets.
