# Svelte API surface (svelte@5.56.8, audited 2026-09-25)

Built from `node_modules/svelte/package.json`'s `exports` map + each submodule's real named
exports (`node -e "console.log(Object.keys(require('svelte/...')))"`), not from memory.

## Runes (compiler-level, no import)

`$state`, `$state.raw`, `$state.snapshot`, `$derived`, `$derived.by`, `$effect`,
`$effect.pre`, `$effect.tracking`, `$effect.pending`, `$effect.root`, `$props`, `$props.id`,
`$bindable`, `$inspect`, `$inspect().with`, `$inspect.trace`, `$host`.

## Template syntax

`{#if}/{:else if}/{:else}`, `{#each}/{:else}`, `{#await}/{:then}/{:catch}`, `{#key}`,
`{#snippet}/{@render}`, `{@const}`, `{@debug}`, `{@html}` (dom-specific), `{@attach}`.

## Special elements

`<svelte:head>`, `<svelte:window>`, `<svelte:document>`, `<svelte:body>` (all dom-specific),
`<svelte:element>`, `<svelte:options>`, `<svelte:boundary>`, `<svelte:component>` (legacy,
superseded by dynamic-`<X>` since 5).

## Directives

`bind:`, `use:`, `transition:`, `in:`/`out:`, `animate:`, `class:`, `style:`, `on:` (legacy
component-event form; plain `onclick`-style props are the Svelte 5 default).

## `svelte` (top-level)

`mount`, `unmount`, `hydrate`, `hydratable` (dom-specific), `flushSync`, `tick`, `untrack`,
`settled`, `fork`, `getAbortSignal` (5.2x async), `onMount`, `onDestroy`, `beforeUpdate`,
`afterUpdate` (legacy), `setContext`, `getContext`, `hasContext`, `getAllContexts`,
`createEventDispatcher`, `createRawSnippet`.

## Submodules

- `svelte/store`: `writable`, `readable`, `derived`, `readonly`, `get`, `toStore`, `fromStore`.
- `svelte/motion`: `spring`, `tweened`, `Spring`, `Tween`, `prefersReducedMotion`.
- `svelte/transition`: `fade`, `fly`, `slide`, `scale`, `blur`, `draw`, `crossfade`.
- `svelte/animate`: `flip`.
- `svelte/easing`: the 30 named easing curves (pure math, no DOM).
- `svelte/reactivity`: `SvelteMap`, `SvelteSet`, `SvelteDate`, `SvelteURL`,
  `SvelteURLSearchParams`, `createSubscriber`, `MediaQuery` (browser-only).
- `svelte/reactivity/window`: `innerWidth`/`innerHeight`/`outerWidth`/`outerHeight`/
  `devicePixelRatio`/`online`/`scrollX`/`scrollY`/`screenLeft`/`screenTop` (all browser-only).
- `svelte/attachments`: `createAttachmentKey`, `fromAction`.
- `svelte/legacy`: `run`, `createBubbler`, `handlers`, event modifiers
  (`passive`/`nonpassive`/`once`/`self`/`preventDefault`/`stopPropagation`/
  `stopImmediatePropagation`/`trusted`), `createClassComponent`, `asClassComponent`.
- `svelte/events`: `on` (imperative `addEventListener` wrapper).

## Out of scope (per this skill's scope decision)

SvelteKit, `svelte/server` (SSR-only, no native equivalent), `svelte/compiler` (a build tool,
not a runtime guide feature).
