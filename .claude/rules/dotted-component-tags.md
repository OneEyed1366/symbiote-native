---
paths:
  - 'examples/**'
  - 'apps/docs-site/src/content/**'
  - 'adapters/*/src/modules/animated/**'
---

# `<Animated.View />` works in Vue and Svelte — only Angular needs a named import

A dotted tag was aliased to a local const in every Vue and Svelte example and in three docs
pages, each carrying a comment stating the template "can't parse a dotted tag name". The claim
was false, and it had been copied across six example files and the public docs.

Measured 2026-08-19 against the INSTALLED compilers, not from memory:

```
Svelte 5.56.8   <Animated.View/>  ->  $.component(node, () => Animated.View, …)
Vue 3.5.39      <Animated.View/>  ->  _createBlock($setup["Animated"].View, …)
```

Svelte's form is additionally REACTIVE in the component position — the reference is read through
a thunk, so a namespace whose member changes is picked up. Both compile with zero warnings.

## Angular is the real exception, for an unrelated reason

`ngc`'s AOT partial-mode compiler statically evaluates template type-checking and cannot trace a
component class through property access on an external, pre-compiled namespace object — only
through a direct named import binding. Hence `@symbiote-native/angular` exports `AnimatedView`,
`AnimatedText`, `AnimatedImage`, `AnimatedScrollView`, `AnimatedFlatList` and
`AnimatedSectionList` as top-level named symbols. **`tsc` and Vitest do not catch a dotted
reference here — only a real `ngc` build does, as NG1010** (`examples/angular/src/components/
AnimatedDemo.ts` records the incident).

So the per-adapter consumer spelling is:

```
React · Vue · Svelte    <Animated.View …/>            dotted, as written
Angular                 import { AnimatedView }        named symbol, mandatory
```

## It happened twice in one session, in the same adapter

The second: `adapters/svelte/src/modules/animated/index.ts` carried a header stating there is no
generic `createAnimatedComponent(Component)` because "Svelte has no equivalent" of React's
`createElement` / Vue's `h()`. Probed on the same 5.56.8: a dynamic `<Component {...rest}
bind:this={inner} />` compiles clean to `$.component(node, () => $$props.component, …)`, and a
runtime `createAnimatedComponent` returning `(anchor, props) => Generic(anchor, proxiedProps)`
mounted and repainted correctly through the adapter's own `mount()`. Svelte 5 dynamic components
are ordinary expressions.

The real boundary there is a DESIGN one — a generic wrap would be a second mechanism (one
parametrized `.svelte` plus a props-Proxy into Svelte private internals) beside the six
hand-authored files, not a replacement. That is a legitimate reason to keep the files. "The
framework cannot do it" was not. The header now says so.

## The lesson under it

Consumer-facing parity is STRUCTURAL: a framework may legitimately spell the same capability
differently, and that is fine. What is not fine is inventing a limitation and then teaching it —
a workaround copied between adapters looks like a considered per-framework idiom long after the
reason has evaporated (or never existed). Before writing "framework X can't do Y" in an example
or a doc page, compile the two-line probe against the version in `node_modules`. Both probes
above are four lines of `compile()` / `compileTemplate()` and would have caught this at write
time. This applies to an ADAPTER SOURCE HEADER as much as to a doc page: a scope boundary stated
as a capability limit outlives the person who could have checked it.

## NG8002 on a host tag: `CUSTOM_ELEMENTS_SCHEMA` does not rescue a MATCHED component

Second member of this file's "only a real `ngc` build says so" family, found 2026-09-08 when it
blocked publishing three packages:

```
src/components/modal/index.ts:119 - NG8002: Can't bind to 'collapsable'
  since it isn't a known property of 'view'.
```

`view` matches `ViewHost`, a real `@Component({ selector: 'view, View' })`. A schema only covers an
element NO directive matches, so `schemas: [CUSTOM_ELEMENTS_SCHEMA]` on the same component is
irrelevant — the moment a primitive stopped being a hyphenated custom element and became a matched
host component, every binding it does not declare became a hard AOT error.

Route it through `[symbioteHostProps]` instead, which is what the other adapters' shared render fn
already emits as one bag (`render-modal.ts` puts `collapsable: false` beside `style`).

**And it stays green everywhere until something actually AOT-builds.** `tsc --build` and the full
vitest suite both passed with this live; `adapters/angular/build/` was simply stale, so
`packages/{navigation,slider}` compiled against its old `.d.ts` and only failed once a publish ran
`clean` first. A binding added to an Angular template is not verified by any check this repo runs
per-commit — build the adapter, or the error surfaces at release.
