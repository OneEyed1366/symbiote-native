---
paths:
  - "adapters/*/src/index.ts"
  - "packages/*/src/*/index.ts"
  - "core/engine/src/index.ts"
  - "core/components/src/index.ts"
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
