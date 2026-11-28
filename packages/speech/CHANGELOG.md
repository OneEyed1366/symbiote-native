# @symbiote-native/speech

## 0.1.3

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

## 0.1.2

### Patch Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Rewrite the README of every Expo wrapper package around the problem it solves, and add a Common questions section with cited sources.

## 0.1.1

### Patch Changes

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Rewrite the README of every Expo wrapper package around the problem it solves, and add a Common questions section with cited sources.
