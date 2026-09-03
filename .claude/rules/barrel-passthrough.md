---
paths:
  - 'adapters/*/src/index.ts'
  - 'packages/*/src/*/index.ts'
  - 'core/engine/src/index.ts'
  - 'core/components/src/index.ts'
---

# Barrel re-exports - add a shared name to ALL adapters, never to one

About half of each adapter's public surface is names re-exported verbatim from
`@symbiote-native/engine` / `@symbiote-native/components`. A missing re-export is
**not a type error**, so `tsc` never catches it and the gap only surfaces when an
app cannot import the name from ITS framework's package. This has already drifted
twice (`PanResponder`, then 22 more names, all closed 2026-08-15). Adding a shared
name to one barrel means adding it to all four in the same commit -
`tests/adapter-barrel-parity.test.ts` enforces this and compares `KNOWN_GAPS` for
EQUALITY, so closing a gap also requires deleting its entry.

Before "closing" a gap, check the other adapters RE-EXPORT the shared type rather
than declaring their own of the same name (`ITextInputProps`, `IImageProps`,
`IButtonProps` are per-adapter by design) - a name-level check cannot tell those
apart.

**Never add a passthrough stub file** (`src/modules/x.ts` containing only
`export { X } from '@symbiote-native/engine'`). 31 of them were deleted 2026-08-15;
a pure passthrough belongs in the barrel itself.

**In `packages/*`, decide PER SUBPATH, not per package.** If a `./react`/`./vue`/
`./svelte` subpath is genuinely and permanently stateless (plain sync/async free
functions, no event/subscription stream a hook/composable/rune could ever wrap),
don't write a physical barrel file at all - point that subpath directly at
`./src/core/index.ts` in both `exports` and `publishConfig.exports` (same value
`.` already has) and delete `src/<fw>/index.ts`. Only write the physical
`export * from '../core'` file when the subpath needs to exist for some other
reason - it withholds part of core (`sensors`, `splash-screen`), carries a
load-bearing side effect (`slider`'s `import '../register'`), or adds real
per-framework lifecycle (a hook/composable/rune/service for that adapter).
`./angular` is NEVER aliased this way, regardless of statelessness - it always
keeps its own ngc/AOT conditional-exports block and its own `src/angular/index.ts`.

Full rationale - why the facade stays, which argument for it is false, and the
measured numbers: invoke the `symbiote-parity-check` skill (§4b).

## The inverse hazard: the shared barrel publishes to five packages at once

The rule above is about a name that reaches only ONE adapter. The mirror is a name that reaches all
five without anyone deciding it should: an adapter barrel re-exports the shared barrel wholesale, so
a symbol added to `core/components/src/index.ts` becomes public API in `@symbiote-native/{react,vue,
svelte,solid,angular}` in the same commit, with no adapter edited and nothing to review.

Caught 2026-08-23 on `resolveStateStyle`. It exists for code a TRANSFORM emits — the lowered element
imports it — and it was placed on the shared barrel because two adapters had byte-identical copies.
Correct extraction, wrong door: an internal helper became a supported export in five packages.

**A symbol that exists for EMITTED code belongs on a subpath, never on a barrel** — the shape
`host-primitives` and `specialize-state-style` already use, and now `state-style`: implementation at
`core/components/state-style`, a thin mirror at `adapters/<fw>/state-style`, and the transform emits
the ADAPTER specifier so the app imports from the package it already depends on.

Two checks when adding anything to a shared barrel: does every adapter's public surface want this
name, and is it named by hand-written app code or only by generated code? The second answer alone
settles it.

And a subpath is only half-declared until `publishConfig.exports` carries a `{types, default}` PAIR.
A bare string there resolves in the tarball and arrives UNTYPED, which
`tests/package-subpath-parity.test.ts` cannot see — it resolves the specifier, not the types. Three
of five adapters had the bare string on this subpath.
