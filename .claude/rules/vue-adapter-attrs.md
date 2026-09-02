---
paths:
  - 'adapters/vue/src/**/*.ts'
  - 'packages/*/src/vue/**/*.ts'
---

# Vue lifecycle components — attrs must go through `normalizeVueAttrs`

Vue does NOT camelCase `$attrs` (only declared `props`, which this codebase never
declares). Reading a multi-word option (`drawerPosition`, `screenOptions`, `initialRouteName`,
`contentContainerStyle`, ...) off raw `attrs` silently drops any kebab-case-authored SFC
template value. Before reading anything off a setup context's `attrs`, invoke the
`vue-adapter-attrs-normalization` skill — the fix is one line:
`const attrs = normalizeVueAttrs(rawAttrs);` right after destructuring, imported from
`@symbiote-native/vue`.

## `setupContext.attrs` is a TRACKING proxy in production, not just dev

`createSetupContext` hands out `new Proxy(instance.attrs, attrsProxyHandlers)` in BOTH branches,
and the production trap is `get(target, key) { track(target, "get", ""); return target[key]; }`
(`runtime-core.esm-bundler.js:8357`). So every attr read costs a WeakMap get, a Map get and a
`dep.track()`, and each instance's first read also allocates a `Map` + a `Dep` into the global
`targetMap` for the component's lifetime. Two consequences:

- **`normalizeVueAttrs` always returns a plain copy** — it used to hand the input back when no key
  needed converting, which is every already-camel SFC/TSX bag, i.e. exactly the hot ones. Do not
  "restore" that early return; the copy loop reads every key through the trap once regardless, so
  the only thing it saved was one object.
- **A hot component captures the unproxied bag once via `useRawAttrs(contextAttrs)`**
  (`composables/use-raw-attrs.ts`). Safe because `initProps` assigns `instance.attrs` once and
  `updateProps` mutates that same object in place. **Setup bodies only** — `getCurrentInstance()`
  resolves to `currentInstance || currentRenderingInstance`, so from a render fn, a `computed`, or
  any deferred callback it can return a DIFFERENT component and hand back the wrong bag.
  `virtualized-list/index.ts` calls `normalizeVueAttrs` inside a `computed` for that reason and
  must keep using the context attrs.
