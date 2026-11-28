# Svelte adapter gap list (rewritten 2026-11 for the custom renderer, first audit 2026-09-25)

## Architecture

The adapter drives `svelte/renderer` (`createRenderer`, svelte >= 5.59.1, experimental). Components
are compiled with `experimental.customRenderer: '@symbiote-native/svelte/renderer'`, and Metro
resolves Svelte's runtime with the condition `svelte-custom-renderer`.

The renderer lives in `adapters/svelte/src/symbiote-renderer.ts`. Svelte's elements are engine nodes
(`ISymbioteNode`) themselves, with no JS retained tree between them, and `root-element.ts` appends
one `view` as the mount target. The old DOM emulation is gone: no patched globals, no
`getComputedStyle`, no `element.animate()`, no `getBoundingClientRect`, no `cloneNode`.

## Rejected by the compiler under a custom renderer

Each of these fails at compile time, so none of them can be silently inert:

- `bind:` on elements: `bind:this` on an element is `{@attach}`, via `captureHost`
- `on:` directives: use `onX={...}` props
- `transition:`, `in:`, `out:` and `animate:`: dropped, with negative tests that pin the error
- `{@html}` and `<svelte:window|document|body|head>`: use the runtime modules instead

`createEventDispatcher` is the `on:` case: its listener side is `on:ping`, so it is pinned by a
negative compile-error test too. `forbidWebOnlyConstructs()` still names the fix for the same
constructs, plus browser-only imports (`svelte/reactivity/window`, `MediaQuery`).

## Works by construction (pure JS or compiler output)

- Runes: `$state`, `$derived`, `$effect`, `$props`, `$bindable`, `$inspect`
- Blocks: `{#if}`, `{#each}`, `{#await}`, `{#key}`, `{#snippet}`, `{@render}`, `{@const}`
- `<svelte:boundary>` and `<svelte:element>`
- `svelte/store`, `svelte/motion` (pure JS plus `requestAnimationFrame`), context and lifecycle
- `{@attach}`, the one directive that compiles on both elements and components

## Open items

- A bare `style={obj}` reaches the engine through a private svelte symbol found by
  `style-cache.ts`. It is checked once at load and throws when svelte changes it.
- A style of claimed keys alone (`animation*`) now reaches `CSSManager` after a class of claimed
  keys. The fix is in the engine (`pushClassStyle`, `isOfferStale`) and covers every adapter.
