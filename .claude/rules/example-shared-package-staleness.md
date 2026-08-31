---
paths:
  - 'examples/**'
  - 'core/components/**'
  - 'core/engine/**'
  - 'adapters/**'
  - 'packages/**'
  - 'scripts/check-packed-consumer-bundles.mjs'
---

# A `core/*` change is invisible to `examples/*` — and the failure is a blank white screen

`examples/*` is a standalone `npm install` tree: `@symbiote-native/engine` and
`@symbiote-native/components` resolve to **published registry versions**, pinned as literals.
Re-packing the adapter does NOT bring your `core/` change along — the adapter tarball only
_declares_ `"@symbiote-native/components": "0.4.0"`, and npm happily serves the 0.4.0 that is on
npm, not the 0.4.0 in your worktree.

So the moment an adapter calls a **newly added** shared API, the app breaks — with a stack that
points nowhere near the cause. Measured 2026-08-17, after `createDescriptorShapeGuard` moved into
`core/components`:

```
TypeError: undefined is not a function
    at descriptor-to-solid.js:34          ← module TOP LEVEL, during require
    at loadModuleImplementation
TypeError: Cannot read property 'View' of undefined
    at App (App.tsx:32)
```

The call is at module scope (`const shape = createDescriptorShapeGuard('…')`), so the _module_
throws while loading, its exports stay empty, and the whole `@symbiote-native/<fw>` barrel becomes
`undefined`. On screen: a blank white app, no red box worth reading. The obvious-looking diagnosis
("the root View lost its `flex: 1`") is wrong and costs a debugging round.

**Nothing in-repo catches this.** `pnpm typecheck`, `pnpm test`, eslint and even a full Metro
bundle all resolve `core/*` from the workspace, where the new API exists.

## The fix

Pack the shared package too, and add it as a DIRECT dependency of the example (it is normally only
transitive, so there is nothing to overwrite):

```sh
cd core/components && pnpm pack --pack-destination ../../examples/<app>
# package.json: "@symbiote-native/components": "file:./symbiote-native-components-<version>.tgz"
cd examples/<app>
rm -rf node_modules/@symbiote-native/{components,<fw>} && rm -f package-lock.json && npm install
cd ios && pod install
```

Keep the tarball's version equal to the one the adapter tarball pins, or npm installs a second,
nested copy and the adapter keeps resolving the stale one. Verify one hoisted copy:
`find node_modules -path "*@symbiote-native/components/package.json" | wc -l` → `1`.

## The 2-second gate that turns this from a device bug into a check

Statically compare what the adapter's built output IMPORTS from the shared packages against what
the INSTALLED copies actually export — run from the example directory:

```js
// collect every named import from '@symbiote-native/{components,engine,css-parser}'
// across node_modules/@symbiote-native/<fw>/build/**/*.{js,jsx}
// then assert each name appears in node_modules/<pkg>/build/index.js
```

A miss names the exact symbol and package. Run it after every re-pack; it costs nothing and it is
the only signal that appears before the simulator.

## CI uses fresh tarball consumers — never an in-place overlay

`scripts/check-packed-consumer-bundles.mjs` closes this class of false green without maintaining
an allowlist of folders to overwrite. It performs the same sequence a real npm consumer does:

1. Read the five standalone examples (React, Vue SFC, Svelte, Angular, Solid).
2. Pack every direct `@symbiote-native/*` dependency they declare from the current checkout.
3. Copy each example's tracked files to a disposable directory.
4. Rewrite all direct internal dependencies there to `file:<fresh tarball>` and run a clean
   `npm install` with no lockfile.
5. Verify the installed manifest of every direct internal package is byte-equivalent JSON to the
   packed manifest, and that exactly one `@symbiote-native/engine` copy exists.
6. Run the example's real type check (or Angular AOT build).
7. Build production Metro bundles for **both iOS and Android**.
8. Inspect each sourcemap for foreign-framework package files and assert the current framework's
   freshly packed adapter actually reached the graph.

This deliberately replaces the old `pnpm pack` + extract-over-`node_modules` overlay. An overlay
could update package bytes but could not install a package's newly added dependencies, and it left
most adapters on registry versions. A disposable npm install exercises the whole packed contract:
exports, dependencies, peer ranges, singleton deduplication, framework transforms, and
platform-specific resolution.

The root command is:

```sh
pnpm run prepublish-build
pnpm run check:bundle-isolation
```

For a focused local run, narrow either axis without weakening CI's default matrix:

```sh
SYMBIOTE_CONSUMER_FRAMEWORKS=solid \
SYMBIOTE_CONSUMER_PLATFORMS=android \
  pnpm run check:bundle-isolation
```

The script copies only tracked example files and deletes its temporary directory on completion, so
it never mutates an example's committed `package.json`, lockfile, or `node_modules`.

## A half-local consumer is worse than a fully registry consumer

Do not manually replace only `engine`, only `components`, or only an adapter in an example. A
same-version mixture of local and registry artifacts can load a new caller against an old callee
and fail at module evaluation with a blank screen. Move the example's direct internal dependency
set together, remove `node_modules/@symbiote-native`, and reinstall. The CI matrix does this
structurally by rewriting every direct internal dependency in the disposable manifest.

## Angular must AOT-build before Metro

Angular's `index.js` imports `./build/angular/src/App`, which is gitignored `ngc` output. The matrix
therefore runs `npm run ng:build` before either platform bundle. A plain Metro call against a fresh
checkout otherwise fails at the first import and says nothing about package compatibility.
