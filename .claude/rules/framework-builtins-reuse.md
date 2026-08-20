---
paths:
  - 'adapters/*/src/index.ts'
  - 'adapters/*/src/renderer/**'
  - 'adapters/*/src/render.ts'
---

# Reuse the framework's OWN primitive before writing a twin of it

A framework's built-ins split into a renderer-agnostic half and a DOM-bound half, and **the split
is a package boundary you can look up**. Everything on the agnostic side drives our engine
unchanged, because the seam it binds through is the same seam our adapter implements. Writing a
parallel API beside a working built-in is the worse outcome twice over: it is work, and it is an
API a developer of that framework does not already know.

```
react     react                 agnostic entirely     Suspense, lazy, memo, Fragment,
          react-dom             DOM                   createContext, error boundaries;
                                                      portals come from the RECONCILER
vue       @vue/runtime-core     agnostic              Teleport, Suspense, KeepAlive,
          @vue/runtime-dom      DOM                   BaseTransition, Fragment
solid     solid-js              pure reactivity       For, Show, Index, Suspense,
          solid-js/web          DOM                   ErrorBoundary, lazy, stores
angular   @angular/core         agnostic BY DESIGN    @if/@for, NgTemplateOutlet,
          platform-browser…     DOM                   ViewContainerRef, TemplateRef
svelte    svelte/internal/client  DOM — no seam       see below
```

## Svelte inverts the question, it does not escape it

Svelte compiles to a DOM-bound client runtime, so there is no agnostic package to borrow from. Our
adapter answers with a **DOM shim** (`adapters/svelte/src/dom-shim/`, `createRootShimElement` in
`render.ts`) whose operations land on engine nodes. So the question stops being "which package is
it in" and becomes **"what DOM does this primitive touch, and does the shim implement it?"** —
which is empirical, and a NO is usually a small local addition rather than a design question.
Measured: `<svelte:boundary>` works over the shim, and the community `use:portal` action body
(`target.appendChild(node)`) relocates a live subtree, engine nodes and all.

## Probe against `node_modules`. Never reason, and never trust a comment.

This has gone wrong in both directions, repeatedly, and the cost is always the same: a limitation
that does not exist gets written down, copied across adapters and docs, and outlives everyone who
could have checked it.

**Vue's `<Teleport>` was believed absent.** It was implemented, guarded, and covered by two tests —
just never on the barrel — and the barrel's own comment ("Teleport stays same-surface-only by
design") read as a note about something that existed. Shipping it needed **zero** new
`RendererOptions`. The decisive fact was four lines of upstream source: `resolveTarget` consults
the `querySelector` option ONLY for a string target and returns an object target as-is — and Vue's
whole Teleport suite passes against `@vue/runtime-test`, whose `querySelector` throws.

**Solid's `Dynamic` was believed DOM-bound.** Only its STRING branch is; the component branch works
verbatim out of `solid-js/web`, reactive swap included.

See `.claude/rules/dotted-component-tags.md` for the same failure from the other direction — two
invented Svelte/Vue limitations written into source headers, both false against the installed
compiler, both catchable by a four-line probe.

**A probe is cheap and a written-down limitation is forever.** Compile it, mount it against
`installFabric()`, assert on the committed tree. If a primitive turns out to work, the remaining
question is only whether to re-export it — a convention, not a capability (`react`, `vue`,
`solid-js` are top-level app dependencies anyway). If it turns out not to, name the exact missing
operation, because that is what makes the gap fixable.

**And check the barrel, not the source tree.** Three separate capabilities were found implemented,
tested, and unreachable in one day — see `.claude/rules/adapter-parity-audit.md`.
