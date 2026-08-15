// Runtime half of the `<style>` scoping pass. The build-time half — `preprocessor/
// scoped-styles.ts` — rewrites every STATIC class token in a component's own markup while it
// still has the source text. A DYNAMIC `class={expr}` has no tokens to read at build time, so
// its value is wrapped in a call to `scopeSvelteClass` instead. Same split Vue's scoped-style
// path already uses (`scopeClassName` in @symbiote-native/engine, symbiote-sfc-style-compiler §5).
// Both halves apply the identical per-token rule by sharing `./scope-token` — see that file for
// why the rule is not simply declared here.
//
// WHY NOT REUSE THE ENGINE'S `scopeClassName` DIRECTLY. Its input surface is Vue's:
// `string | Record<string, boolean> | Array<those>`. Svelte's is wider — `class={['card', cond &&
// 'on']}` leaves a literal `false` in the array, which `scopeClassName` hands to `.split()` and
// throws on. Widening a function the other three adapters depend on, to serve one adapter's
// syntax, is the trade §22b already refused for `resolveClassName`. Instead this normalizes
// through the adapter's OWN clsx boundary first (`normalizeSvelteClass`) and only scopes what
// comes back as a class string; everything else — a resolved style object, `false`, a mixed array
// holding a style object — is handed on untouched, taking exactly the path it took before.
import { normalizeSvelteClass } from './class-value';
import { scopeToken } from './scope-token';

const CLASS_SEPARATOR = ' ';

export function scopeSvelteClass(
  value: unknown,
  localNames: ReadonlySet<string>,
  scopeId: string,
): unknown {
  const normalized = normalizeSvelteClass(value);
  if (typeof normalized !== 'string') return normalized;
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map(token => scopeToken(token, localNames, scopeId))
    .join(CLASS_SEPARATOR);
}
