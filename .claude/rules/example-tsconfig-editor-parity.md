---
paths:
  - 'examples/**/tsconfig*.json'
---

# An example's `tsconfig.json` is what the EDITOR reads — a build-only override leaves it wrong

`examples/*` type-checks through a second config (`tsconfig.typecheck.json`, `tsconfig.angular.json`)
that CI runs. An editor never sees it: tsserver resolves a file through the nearest `tsconfig.json`
above it. So an option that only the build config carries is an option the editor disagrees with,
on every file, forever — and nothing goes red anywhere.

Measured 2026-09-10 on `examples/vue-tsx`, whose `jsx`/`jsxFactory` lived only in the typecheck
config:

```
tsc -p tsconfig.json            1726 errors   TS2607/TS2786 — every Vue component checked as React's
vue-tsc -p tsconfig.typecheck   0 errors
```

`examples/solid/tsconfig.json` had always carried its `jsx: preserve` + `jsxImportSource` in the app
config, which is why Solid never had this. Put anything that decides how a file is UNDERSTOOD —
JSX factory, `types`, `lib`, `paths` — in `tsconfig.json`; leave the build config for what only the
build needs.

The corollary is that the divergence has to be measured, not read: two configs where one extends the
other look consistent, and `tsc --showConfig -p <each>` is the diff that shows they are not.

## `exclude` is INHERITED, and a parent excluding `e2e/` empties the e2e project

Every canary's Detox specs have their own `e2e/tsconfig.json` extending `../tsconfig.json` — which is
also what `jest.config.js` hands ts-jest. Add `"exclude": [… "e2e"]` to the parent and that entry is
inherited by the child, still pointing at the same directory, which is now the child's own:

```
svelte/e2e/tsconfig.json   TS18003: No inputs were found.
                           exclude resolved to ["../**/node_modules","../**/Pods","../e2e"]
```

`examples/svelte` shipped that way. The specs had no project for an editor to resolve them through,
and ts-jest's `tsconfig: <rootDir>/tsconfig.json` pointed at a config that collected nothing. **A
project with zero inputs also reports zero errors** — so the state is indistinguishable from a clean
one unless you count inputs (`tsc -p … --listFilesOnly | grep -c /e2e/`), which is the check to run
after any `exclude` edit. All five `e2e/tsconfig.json` now restate `exclude` so they are independent
of what the parent excludes.

## `examples/vue-tsx` was in no CI list at all — because the table was keyed by FRAMEWORK

`FRAMEWORK_EXAMPLES` in `scripts/check-packed-consumer-bundles.mjs` had one entry per adapter, and
`vue` mapped to `vue-sfc`. `git grep vue-tsx -- scripts .github tests` returned nothing, so its
`typecheck` ran only when someone typed it — which is how 1726 errors accumulated unseen.

Closed 2026-09-10 by a sixth ARM, and the rename is the fix rather than the entry: an arm is a
canary, a framework is an adapter, and one adapter can have two canaries. Two things had to move
with it.

`findForeignFrameworkLeaks` compares by identity, so it must be handed the FRAMEWORK
(`ownFrameworkOf(example)`, derived from the arm's adapter) and never the arm key — with the key,
every legitimate `navigation/build/vue/**` module in that bundle reports as a foreign-framework
leak. Verified both ways: arm key → 1 leak, derived → 0.

And the coverage test asserted `Object.keys(FRAMEWORK_EXAMPLES) === KNOWN_FRAMEWORKS`, which is not
a coverage check — both sides were hand-written, both said "five", and a sixth canary with no arm
satisfied it. It now compares against `canaryExampleNames()` off disk, so the next example joins by
existing (`scripts/lib/canary-examples.mjs`, `adapterNames()`'s sibling).
