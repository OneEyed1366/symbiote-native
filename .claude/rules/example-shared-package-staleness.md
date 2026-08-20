---
paths:
  - 'examples/**'
  - 'core/components/**'
  - 'core/engine/**'
  - 'scripts/overlay-local-packages.mjs'
  - 'scripts/check-bundle-framework-isolation.mjs'
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

## The same gap, in CI: `overlay-local-packages.mjs` was `packages/*`-only

`scripts/overlay-local-packages.mjs` exists to give `check-bundle-framework-isolation.mjs`
this-commit's build instead of the registry version (same problem, CI-side). It only overlaid
`packages/*` (slider, navigation, …) — `core/engine`, `core/components`, and every
`adapters/*` stayed on whatever's published, so example source that outruns the last publish of
those packages fails CI with an error that looks unrelated to staleness.

Measured 2026-08-21: `examples/angular`'s `BenchmarkScreen`/`JsFrameRateMeter` called
`readCommitProfile`/`registerPostCommit` — real exports of `core/engine`, absent from the
published `0.2.0` — and got `TS2305: has no exported member`. Its `SectionList` binding to
`getItemLayout` failed `NG8002` the same way, because `@symbiote-native/angular@0.7.0` (published)
predates that Input. Both read as ordinary source bugs, not a stale-package symptom.

Fix: `overlay-local-packages.mjs` now also overlays `core/engine`, `core/components`, and
`adapters/angular` (an `OVERLAY_ONLY` allowlist alongside the `packages/*` prefix match) — picked
narrowly, not blanket-widened to every `core/`+`adapters/`. Also overlaying `core/css-parser` and
`adapters/{react,vue,svelte}` was tried and reverted: `core/css-parser` gained a real new
dependency (`lightningcss`) that the overlay's swap-the-folder-contents trick can't install (it
never touches `package-lock.json`, only `pnpm pack` + extract over an already-`npm install`ed
folder — new transitive deps need the full `file:` + reinstall dance from the section above,
not this overlay), and the Vue/Svelte adapters called a `compileScopedCss` export the registry
`css-parser` doesn't have either. Widen this allowlist only when a specific example genuinely
needs it, and check whether the overlaid package pulled in a NEW dependency first.

## `check-bundle-framework-isolation.mjs` also needs Angular's `build/` before bundling

Every other example bundles straight from source; Angular's `index.js` imports
`./build/angular/src/App` — gitignored `ngc` AOT output, produced only by `npm run ng:build`.
Bundling before that step fails on the FIRST import with a plain "module not found", which reads
like a broken example, not a missing build step. Fixed by running `npm run ng:build` in
`buildBundleSources()` before the `react-native bundle` call, framework-gated on `angular`.
