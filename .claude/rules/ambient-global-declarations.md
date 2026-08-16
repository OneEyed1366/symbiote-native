---
paths:
  - 'core/engine/src/**/*.ts'
  - 'core/components/src/**/*.ts'
---

# `declare global` in a shared package typechecks clean here and breaks every consumer

`core/engine` (and `core/components`) compiles against its OWN minimal
`src/globals.d.ts`, not react-native's types. So a `declare global { var X }`
here has nothing to collide with locally — `tsc --build core/engine` passes —
while the same declaration is EMITTED into the package's `.d.ts` and lands in
every downstream package whose tsconfig does pull RN's types in. There it
redeclares RN's own global and fails with TS2451, plus TS2339 wherever the two
declared shapes differ. Angular packages (`adapters/angular`, `packages/slider`)
go through `ngc`, so this surfaces as a build failure, not a test failure.

Measured 2026-08-15: `declare global { var ErrorUtils }` in
`core/engine/src/report-error.ts` against react-native's
`src/types/globals.d.ts:49` (`const ErrorUtils: ErrorUtils`, whose declared
members are only `get`/`setGlobalHandler` — no `reportError`, which the
polyfill does install).

Declaring is fine for a name RN does not — `__SYMBIOTE_DEBUG__`,
`nativeFabricUIManager`, `RN$registerCallableModule`, `RN$Bridgeless` all ship
as `declare global` blocks in the engine's build and always have. The rule is
about a name RN ALREADY owns. Grep
`node_modules/react-native/src/types/globals.d.ts` for it before writing the
block; if it is there, do not declare it at all.

**For a name RN owns, read it off `globalThis` with a runtime guard:**

```ts
const utils: unknown = Reflect.get(globalThis, 'ErrorUtils');
if (typeof utils !== 'object' || utils === null) return null;
const report: unknown = Reflect.get(utils, 'reportError');
if (typeof report !== 'function') return null;
```

Naming the identifier is what invites the collision, and the guard is needed
anyway — the global is absent off a native host. Tests install and remove it
the same indirect way (`Object.assign(globalThis, {...})` /
`Reflect.deleteProperty`), for the same reason.

Verify before claiming it is fixed: `grep 'declare global' core/engine/build/**`
must come back empty for the file you touched — the emitted `.d.ts` is what
consumers see, not the source.
