// Mirrors Vue's own dev-mode `__vueParentComponent` stamp (@vue/runtime-core's mountElement,
// gated on `process.env.NODE_ENV !== 'production'`) onto the engine's framework-agnostic
// ISymbioteNodeOwner, so packages/devtools' panel can show "which Vue component created this
// native node" without knowing anything Vue-specific. See the symbiote-devtools-inspector skill
// for the full per-adapter design (Vue is the only adapter that needs zero new instrumentation —
// Vue's runtime already stamps the owning ComponentInternalInstance onto our node for us).
//
// Gated on RN's own `__DEV__` (not Vue's `process.env.NODE_ENV`) for two reasons: this hook
// registers at module scope, unconditionally, for every Vue app regardless of whether it even
// uses packages/devtools, so it needs to be as cheap as possible in production; and Metro
// DEAD-CODE-ELIMINATES an `if (__DEV__)` branch entirely on a `--dev false` build (confirmed for
// the equivalent React DevTools registration in adapters/react/src/host-config.ts), while
// `process.env.NODE_ENV` would only skip the walk at runtime, not remove it from the bundle. Read
// off globalThis per this repo's ambient-global-declarations rule — `adapters/vue` has no `tsc`
// declaration for RN's `__DEV__` global, and the bare identifier throws under vitest (no Metro
// bootstrap), the same failure mode that rule documents.
import {
  getActiveSurfaces,
  registerPostCommit,
  setNodeOwner,
  type ISymbioteNode,
} from '@symbiote-native/engine';

function resolveComponentName(instance: unknown): string | undefined {
  if (typeof instance !== 'object' || instance === null) return undefined;
  const type = Reflect.get(instance, 'type');
  if (type === null || (typeof type !== 'object' && typeof type !== 'function'))
    return undefined;
  const displayName = Reflect.get(type, 'displayName');
  if (typeof displayName === 'string' && displayName !== '') return displayName;
  const name = Reflect.get(type, 'name');
  if (typeof name === 'string' && name !== '') return name;
  const dunderName = Reflect.get(type, '__name');
  return typeof dunderName === 'string' && dunderName !== ''
    ? dunderName
    : undefined;
}

function tagOwners(node: ISymbioteNode): void {
  if (node.owner === undefined) {
    const component = resolveComponentName(
      Reflect.get(node, '__vueParentComponent'),
    );
    // TODO(devtools-owner-chain): single-element chain — tags only the nearest owning
    // component. A composing-only component (renders exclusively through other components,
    // never a host element directly) never appears as `__vueParentComponent` for any node it
    // doesn't directly create, so it's invisible in the panel — the same gap fixed for Svelte via
    // its `__svelte_meta.parent` call-stack. Full parity means walking `instance.parent` here too.
    if (component !== undefined) setNodeOwner(node, { chain: [{ component }] });
  }
  for (const child of node.children) tagOwners(child);
}

let isRegistered = false;

// registerPostCommit has no matching "unregister" (a plain Set that only ever grows), so this
// must run at most once per app lifetime — mirrors the same constraint packages/devtools'
// react-native.ts already follows for its own post-commit hook.
export function registerVueOwnerTagging(): void {
  if (isRegistered) return;
  isRegistered = true;
  registerPostCommit(() => {
    // Cheap bail in production: Vue itself only stamps `__vueParentComponent` in dev (or with
    // __VUE_PROD_DEVTOOLS__ opted in, which we never rely on), so a prod walk would find nothing
    // anyway — skip the tree walk entirely rather than pay for a guaranteed no-op.
    if (Reflect.get(globalThis, '__DEV__') !== true) return;
    for (const surface of getActiveSurfaces()) {
      for (const node of surface.children) tagOwners(node);
    }
  });
}
