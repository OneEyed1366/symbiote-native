// Vue does NOT camelCase $attrs: a template `:content-container-style` arrives in attrs keyed
// 'content-container-style', but symbiote's prop contract is RN-camelCase (contentContainerStyle)
// and idiomatic Vue templates use kebab-case. Reading `attrs.contentContainerStyle` then misses,
// so a consumed prop is silently dropped (lost padding) and a non-consumed one leaks to Fabric
// (Android `JS Functions are not convertible to dynamic` when a VNode-valued prop forwards). So
// every adapter component normalizes its incoming attrs kebab→camel at entry.
//
// Two prefixes MUST stay kebab: `aria-*` (resolveAccessibilityProps reads 'aria-label' literally)
// and `data-*`. Event keys are already `onXxx` (Vue folds `@value-change` → onValueChange, no
// dash) so they pass through untouched.

const KEBAB_SEGMENT = /-([a-z])/g;

// The template compiler keys a native tag's `@valueChange` as `on:valueChange`, to keep its case
const NATIVE_EVENT_PREFIX = 'on:';

function foldNativeEventKey(key: string): string {
  const name = key.slice(NATIVE_EVENT_PREFIX.length);
  return `on${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function toCamel(key: string): string {
  return key.replace(KEBAB_SEGMENT, (_match, char: string) =>
    char.toUpperCase(),
  );
}

// The per-KEY half, for an intrinsic tag: `patchProp` hands over one key with no bag to fold
// Returns the same string when nothing converts, which is every key on the hot path
export function normalizeVueAttrKey(key: string): string {
  if (key.startsWith(NATIVE_EVENT_PREFIX)) return foldNativeEventKey(key);
  if (!key.includes('-')) return key;
  if (key.startsWith('aria-') || key.startsWith('data-')) return key;
  return toCamel(key);
}

// Always returns a PLAIN copy, never the input. An earlier version handed the input back when no
// key needed converting - which is every SFC/TSX bag, since `@press` / `:style` already arrive
// camel - and that gave callers Vue's attrs PROXY to read from. In production, not just dev, that
// proxy's get trap is `track(target, "get", "")` before every value
// (runtime-core.esm-bundler.js:8357), so each of Pressable's ~16 per-render attr reads paid two
// map lookups it did not need. The copy loop reads every key through the trap once regardless, so
// the only thing the early return ever saved was this one object.
export function normalizeVueAttrs(
  attrs: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(attrs))
    out[normalizeVueAttrKey(key)] = attrs[key];
  return out;
}
