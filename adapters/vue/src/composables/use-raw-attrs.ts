// The unproxied twin of a setup context's `attrs`.
//
// Vue hands `setupContext.attrs` out as `new Proxy(instance.attrs, attrsProxyHandlers)`, and in
// PRODUCTION as well as dev that proxy's only trap is `get(target, key) { track(target, "get", "");
// return target[key]; }` (runtime-core.esm-bundler.js:8357). So every attribute read costs a
// WeakMap get, a Map get and a `dep.track()`, and the first read of each instance also allocates
// a Map and a Dep into the module-global `targetMap` that live as long as the component does.
// Pressable reads ~16 attrs per render and a benchmark create mounts 2 000 of them.
//
// `instance.attrs` is the raw object behind that proxy. Capturing it is safe because its identity
// never changes: `initProps` assigns it once (:4907) and `updateProps` mutates that same object in
// place (`attrs[key] = value` / `delete attrs[key]`), so a reference taken at setup always reads
// current values. The tracking the proxy performs is for reads in a setup BODY; a render fn does
// not need it, because the parent's patch re-runs the child render through `updateComponentPreRender`
// whether or not the child subscribed.
//
// CALL THIS FROM A SETUP BODY ONLY, never from a render fn, a `computed`, or any other deferred
// callback. `getCurrentInstance()` resolves to `currentInstance || currentRenderingInstance`, so in
// a callback that runs while a DIFFERENT component is rendering it returns that component and this
// would silently hand back the wrong bag. `virtualized-list/index.ts` calls normalizeVueAttrs
// inside a `computed` for exactly that reason and must keep using the context attrs.

import { getCurrentInstance } from '@vue/runtime-core';

export function useRawAttrs(
  contextAttrs: Record<string, unknown>,
): Record<string, unknown> {
  const instance = getCurrentInstance();
  return instance === null ? contextAttrs : instance.attrs;
}
