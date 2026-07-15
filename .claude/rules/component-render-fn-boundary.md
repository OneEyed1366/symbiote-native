---
paths:
  - "core/components/src/view/**/*.ts"
  - "core/components/src/state/**/*.ts"
  - "adapters/*/src/components/**/*.ts"
---

# Component logic placement — read `symbiote-add-component` §0 first

Before deciding whether a component's logic belongs in a `renderX()` in core or stays
in the adapter, check the boundary: a render fn moves to core ⟺ every input (after the
framework animates it) is a framework-agnostic VALUE (scalar/prop/style); it stays in the
adapter ⟺ any input is a live SUBTREE of user components (`children`/`renderItem`) — that
is passed through the reconciler, never converted back to a Descriptor. Pure logic that is
injected at DIFFERENT lifecycle points (ScrollView math, list virtualization, press machine)
is still core, but as HELPERS, not a render fn. Three seams live in the adapter BY DESIGN,
not as gaps: effect/commit timing, native-owned state (scroll/focus/measure), and user
children. JS is a declarative language OVER native, never a replacement. Full model +
the five wrong first approximations: invoke the `symbiote-add-component` skill, §0.
