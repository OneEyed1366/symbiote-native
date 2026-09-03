## 6. Component parity (L4) — a generic `descriptorToAngular` NOW EXISTS (mixed adoption)

Full parity is structural (`<adapters_reach_full_feature_parity>`): the shared
*logic* (state machines — e.g. `createPressHandlers`/`createPressRuntime` for
Pressable) lives in `@symbiote-native/components` and every Angular component imports
it verbatim, same as React/Vue.

**Corrected 2026-07**: an earlier version of this section said no generic
walker existed and never would without a large redesign. That is now wrong —
`DescriptorOutlet` (`adapters/angular/src/descriptor-to-angular/index.ts`,
selector `symbiote-descriptor-outlet`) IS the `descriptorToAngular` bridge,
the twin of `descriptorToReact`/`descriptorToVue`. Since Angular has no
`h()`-style hyperscript, it can't return a tree value the way React/Vue's
bridges do — instead it is a standalone `@Component` with `@Input({required:
true}) node!: IDescriptor` that walks the `Descriptor` tree and drives
`Renderer2` **imperatively**: `createElement`/`createText`/`setProperty`/
`appendChild` on first render, then a `patchElement`/`patchChildren` diff on
every subsequent `ngOnChanges` that PATCHES same-`(type, key)` nodes in place
(`sameElement`) rather than clearing and recreating the subtree — mirrors
wolf-tui's `WNodeOutlet` but preserves retained-node identity, matching
Fabric's clone-on-write model. Usage: `<symbiote-descriptor-outlet
[node]="someDescriptor" />` inside any component's template. Covered by
`descriptor-outlet.test.ts` (mount → patch → unmount, node-identity
preserved across patches).

**Adoption is IN PROGRESS, not universal** — check before assuming either
pattern for a given component:
- **`ActivityIndicator`** (`components/activity-indicator/index.{ios,android}.ts`)
  is migrated: its template renders a `<symbiote-descriptor-outlet>` bound to
  the shared `renderActivityIndicator(...)` Descriptor, exactly like React/Vue
  call `descriptorToReact`/`descriptorToVue` on the same shared render fn.
- **Every other component** (`Pressable`, `Switch`, and ~15 more) still uses
  the ORIGINAL pattern this section used to document exclusively: each
  component hand-writes its own Angular `@Component` template that mirrors
  what the shared render function would produce, binding directly onto the
  `primitives/` host components (`symbiote-view`, `symbiote-text`, …) via
  `[prop]="…"` / `(event)="…"` bindings, with no `Descriptor` walk at all.

Practical effect: don't assume a component's shape from this section alone —
`grep -l DescriptorOutlet adapters/angular/src/components/*/index*.ts` tells
you which pattern a given component actually uses today. When adding a NEW
component that has a shared `@symbiote-native/components` render function, prefer
`DescriptorOutlet` (it's the generic, already-proven path — see
`ActivityIndicator`) over hand-writing a new template; only fall back to a
hand-written template if the component's real event/imperative-ref needs
don't fit cleanly through a plain `Descriptor` prop bag (this hasn't been hit
in practice yet, so treat it as a hypothesis, not settled guidance). Migrating
the remaining ~15 hand-written components to `DescriptorOutlet` is a real,
uncompleted backlog item — do not treat it as done just because the bridge
exists.
