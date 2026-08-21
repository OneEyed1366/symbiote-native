---
paths:
  - 'scripts/*.mjs'
  - 'package.json'
  - '*/*/package.json'
---

# `tsc --build` never deletes the output of a source you deleted

It emits; it does not reconcile. Delete `src/foo.ts` and `build/foo.js` stays forever, and
`files: ["build"]` ships it in every tarball packed from that tree.

Measured 2026-08-19:

```
12 packages     build/{react,vue,svelte}/index.js + .d.ts   sources gone since the
                                                            "collapse redundant … barrels" commit
adapters/solid  build/components/scroll-view/animated-host.jsx   source deleted that day
adapters/solid  build/ctx-probe.jsx · build/ns-probe.jsx          forgotten probe files
```

`fix-esm-extensions` was still rewriting import specifiers inside the dead files.

## It cannot reach npm — it reaches the examples loop

`build/` is gitignored and the release runs on a clean `actions/checkout`, so CI never sees it.
A local `pnpm pack` does — and that is the everyday loop for `examples/*`
(`<examples_vs_dot_examples>`). `examples/solid` was running a tarball containing a component
that no longer existed in source.

## The trap inside the fix

`pnpm run clean:build` (`scripts/clean-build-outputs.mjs`) runs first in `prepublish-build`.

**Deleting `build/` alone is not enough, and it fails in the worst direction.** `tsc --build`
reads `tsconfig.tsbuildinfo`, concludes every project is up to date, and emits **nothing** —
leaving an empty `build/` that looks like a successful build. Both go, together.

Same shape as the examples' stale-install trap: removing `node_modules/@symbiote-native/<pkg>`
without `package-lock.json` also short-circuits. Two artifacts, one state; remove one and you get
a confident wrong answer.

Full `prepublish-build` from clean is ~27s, so there is no incremental-build argument against it.
`build-ngc/` is deliberately untouched — each package's `ng:build` cleans it already.

## Detecting drift

Walk `build/`, strip the emitted extension, look for ANY source spelling. Two things fool a naive
version: `.svelte.ts` rune files (two extensions) and `adapters/angular/build/angular/**` (ngc's
nested tree, not tsc's). Both produced false positives — 134 reported, 39 real.
