# @symbiote-native/test-utils

## 0.4.2

### Patch Changes

- Updated dependencies [[`1e8cd62`](https://github.com/OneEyed1366/symbiote-native/commit/1e8cd62387caded852fbb8e14c04b3195fc2c516)]:
  - @symbiote-native/engine@1.3.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`b463e81`](https://github.com/OneEyed1366/symbiote-native/commit/b463e81665268cfdb0489b384559079bc0f51109), [`15ef569`](https://github.com/OneEyed1366/symbiote-native/commit/15ef5691fab269b55a8eb233a07025c6ef15b384), [`15ef569`](https://github.com/OneEyed1366/symbiote-native/commit/15ef5691fab269b55a8eb233a07025c6ef15b384), [`2168a5e`](https://github.com/OneEyed1366/symbiote-native/commit/2168a5ed82e161fad5627c678d4c527a7e328fcc), [`1b5c9d1`](https://github.com/OneEyed1366/symbiote-native/commit/1b5c9d1cc1abcd90b4e7aed0c1c6c130aeac5d45)]:
  - @symbiote-native/engine@1.2.0

## 0.4.0

### Minor Changes

- [`35fb51c`](https://github.com/OneEyed1366/symbiote-native/commit/35fb51c97edaff5929838863df12d4201885fa2c) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Cut what a removal costs: a narrower teardown walk, a real `firstChildOf`, and a cheaper batch
  boundary.

  `ITreeHost` gains two required members. The type is an internal seam, exported to be read rather
  than implemented outside this repo, so a new required member lands in a minor; both hosts shipped
  here already have them.

  - `firstChildOf` answers with one handle instead of `childrenOf(handle)[0]`. The old spelling read a
    list of N, then N-1, then N-2, so emptying a parent the way `solid-js/universal` does crossed
    N(N+1)/2 handles. A 2 000-row Solid clear went from 435 ms to 35 ms.
  - `teardownSubtreesOf` returns only the nodes a teardown has work for: each root, each node carrying
    an intrinsic tag, and each node between the two. An animated binding is per node and carries no
    tag, so a tree holding one still gets the full walk.
  - `applyOps` reads its four tables with `getObject`/`getArray` rather than the checking pair. The
    batch has one producer and the assert build keeps the checks, so a malformed batch still aborts
    there. Entering the host fell from 5.5 us to 2.8 us, which is what a framework reading the tree
    between mutations pays per read.

  `isTornDown` and `hostBehavior` moved off a `WeakSet` and a `WeakMap` onto the node, so a node with
  no behavior leaves the detach path before two lookups that were never going to find anything.

### Patch Changes

- Updated dependencies [[`35fb51c`](https://github.com/OneEyed1366/symbiote-native/commit/35fb51c97edaff5929838863df12d4201885fa2c)]:
  - @symbiote-native/engine@1.1.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`72eab44`](https://github.com/OneEyed1366/symbiote-native/commit/72eab44031a0bb30cd90ac9d0fbc55de15606e26), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`d6fe117`](https://github.com/OneEyed1366/symbiote-native/commit/d6fe117ea712a41e6118f0cb4e84799817ee8d21), [`d6fe117`](https://github.com/OneEyed1366/symbiote-native/commit/d6fe117ea712a41e6118f0cb4e84799817ee8d21), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023)]:
  - @symbiote-native/engine@1.0.0

## 0.3.0

### Minor Changes

- [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - An oracle for lowering, and a settle that does not measure machine speed.

  `lowering-equivalence` mounts a primitive as a component and as a bare intrinsic with the same
  props and requires the two committed trees to match by key name. Committed rather than retained,
  since anchors are exactly what lowering removes. It guards the two false greens that would
  otherwise make it decorative — both arms taking the same path (caught by the retained node count,
  which lowering must change) and both arms empty before `completeRoot`.

  `fake-fabric` counts `appendChild` and `cloneNode` alongside `createNode`, so a benchmark arm can
  show a tree is structurally identical before any timing is read.

  `waitForQuiet` now settles on wall time as well as consecutive ticks, and `advanceMs` observes for
  a duration. A tick count cannot express "no work arrived", only "the queue drained N times", and
  how much wall time that spans is a property of the machine: a list committing one deferred batch
  30-60 ticks in was declared quiet on an idle machine and caught under load, reading as free-running
  change detection.

## 0.2.0

### Minor Changes

- 3acd869: Add Solid.js as a supported framework: a new `@symbiote-native/solid` adapter reaching full
  component/runtime parity with the other four adapters, plus a `./solid` export subpath on every
  companion package. Engine and shared-component packages gained portal/tunnel, retained-tree
  census, and profiling infrastructure that the new adapter (and the others' portal/tunnel work
  landing alongside it) build on.

## 0.1.6

### Patch Changes

- 56ef0d9: Add the missing `"license": "MIT"` field to every publishable package's `package.json`. The
  `LICENSE` file itself was already shipping correctly (pnpm copies the workspace root `LICENSE`
  into a package's tarball at pack/publish time when the package has none of its own — confirmed
  against the already-published `@symbiote-native/slider@4.0.0` tarball on npm), but the
  `package.json` metadata field npm reads for the registry page's license badge and `npm install`'s
  own license check was missing on all eleven packages.

## 0.1.5

### Patch Changes

- d738bc5: Fix the published `build/index.js` re-exporting `./fake-fabric` without a `.js` extension, which Node's ESM loader rejects outside a bundler (`Cannot find module '.../build/fake-fabric'`) — the compiled package has never worked when imported from a real npm install, only when Metro/Vitest resolved `src/*.ts` directly. `core/test-utils/build` was missing from the `fix-esm-extensions` script's argument list; every other publishable package with build output was already covered.

## 0.1.4

### Patch Changes

- f0589ae: Fix the published `build/index.js` re-exporting `./fake-fabric` without a `.js` extension, which Node's ESM loader rejects outside a bundler (`Cannot find module '.../build/fake-fabric'`) — the compiled package has never worked when imported from a real npm install, only when Metro/Vitest resolved `src/*.ts` directly. `core/test-utils/build` was missing from the `fix-esm-extensions` script's argument list; every other publishable package with build output was already covered.

## 0.1.3

### Patch Changes

- 46a4f27: Documentation and code-comment cleanup: remove internal-only references and tighten wording. No runtime or API changes.

## 0.1.2

### Patch Changes

- ec8036e: Republish with the `build/` directory actually included — the currently published `0.1.1` tarball is missing it entirely (only `package.json`/`README.md`/`LICENSE` shipped), breaking module resolution for every consumer. `pnpm pack` against the current source confirms `build/` is produced correctly; this was a one-off publish gap, not a config bug.

## 0.1.1

### Patch Changes

- e2ba63c: Publish the shared fake-Fabric test harness to npm so examples can depend on it directly instead of a workspace link.
