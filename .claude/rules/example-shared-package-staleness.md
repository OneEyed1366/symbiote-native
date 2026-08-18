---
paths:
  - 'examples/**'
  - 'core/components/**'
  - 'core/engine/**'
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
