---
paths:
  - 'adapters/angular/src/**/*.ts'
  - 'packages/*/src/angular/**/*.ts'
---

# Angular adapter/renderer source — read `angular-adapter` first

A new `@Component` here defaults to **CheckAlways** — Angular 22 assigns `LViewFlags.CheckAlways`
unless the def is signal-based or OnPush (`view/construction.ts:263`), and a Global tick refreshes
every CheckAlways view (`change_detection.ts:464`). The 15 primitives in `primitives/index.ts`
(`ViewHost`/`TextHost`/…) are all CheckAlways today, so one tick walks the screen's whole primitive
tree — the measured cause of Angular alone dropping the UI thread and starting at 250+ MB. Do not
"fix" it by flipping OnPush component-by-component: `SymbioteStyleInputDirective` and the `ngDoCheck`
polls exist because `[style]`/`class` never dirty a view, and CheckAlways is what currently covers
that gap. Style/class get a signal path first. Full evidence and migration order: `angular-adapter` §21.

`View`/`Text` (`primitives/index.ts`) carry a DUAL selector, `'symbiote-view, View'` /
`'symbiote-text, Text'` — every flat-row primitive is still a real `@Component` (LView/TView/DI/
`<ng-content>`), and a headless A/B lowering them to bare `symbiote-view`/`symbiote-text` custom
elements (no `View`/`Text` in `imports`, `schemas: [CUSTOM_ELEMENTS_SCHEMA]`) measured a 33.2% cut
on Create-1000 — bigger than the setProp-count fix, and visible on V8 (not just Hermes), so it is
structural work, not an interpreter tax. `angular-adapter-change-detection` §19 has the mechanism
(Angular's `CUSTOM_ELEMENTS_SCHEMA` only accepts a HYPHENATED tag,
`.vendors/angular/.../dom_element_schema_registry.ts:400,422`) and the on-device next step, not yet
run. Do not re-derive this from scratch — read §19 first.

Any composed `@Component` used as a plain `<Tag>` (adapter-authored, app-authored, or
navigation-package-authored) MUST be in `ANCHOR_HOST_COMPONENTS`, or it silently paints
wrong/invisible on a real device — never provable via vitest/tsc/ngc alone. The registry
(`ANCHOR_HOST_COMPONENTS` + `registerComposedComponent` + `isAnchorHostComponent`) lives in the
dependency-free LEAF module `adapters/angular/src/anchor-host-registry.ts` (NOT in the
require-cyclic `renderer/index.ts`); the renderer imports it and the barrel re-exports
`registerComposedComponent` off it, BOTH by relative path (one Metro resolution route → one Set),
and the babel-register-composed plugin injects the barrel import. Do NOT give it a package subpath
injected alongside the relative imports (two routes → two Sets under pnpm symlinks). The bug that
actually surfaced this was STALE ngc BUILD ARTIFACTS: `ngc -p` never deletes orphaned outputs, so a
renamed source (`renderer.ts` → `renderer/index.ts`) leaves `build/angular/renderer.js` behind and a
file shadows a folder in Metro resolution → a stale second registry Set. Every Angular package now
`rm -rf build` before `ngc` (its `clean` script) — do NOT drop that. Device-verified 2026-07-17. See
angular-adapter §11c. The lookup is case-INsensitive (fixed 2026-07-09): a
component mounted via `NgComponentOutlet`/`ViewContainerRef.createComponent` (every screen
`Stack`/`Tab`/`Drawer` mounts) reaches `createElement` with its selector LOWERCASED by
Angular's runtime, unlike a static template tag which keeps its authored case — do not
reintroduce a case-sensitive check. Before editing renderer/component logic here, invoke the
`angular-adapter` skill (§11/§11a) and the `angular-adapter-build` skill.
