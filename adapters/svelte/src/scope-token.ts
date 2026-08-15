// The `<style>`-scoping rule for ONE class token, and nothing else.
//
// WHY THIS IS ITS OWN FILE — it looks like it belongs in `./style-scope`, and it cannot live
// there. The build-time half (`preprocessor/scoped-styles.ts`) and the runtime half
// (`./style-scope`) must apply the SAME rule or a static `class="card"` and a dynamic
// `class={'card'}` would disagree, so it has to be shared. But `svelte.config.js` is loaded
// DIRECTLY by Node (svelte-check, the language server): Node strips the types off a `.ts` file
// yet still runs its own ESM resolver over whatever that file imports, where an extensionless
// relative specifier is a hard `ERR_MODULE_NOT_FOUND`. `./style-scope` imports `./class-value`
// imports `@symbiote-native/engine` — an entire extensionless graph the preprocessor must never
// pull in. So the shared rule lives HERE, with ZERO imports of its own, reachable from the
// preprocessor through the `@symbiote-native/svelte/scope-token` exports subpath (which supplies
// the extension at both targets, `src` in-workspace and `build` when published).
//
// Keep this file import-free. Adding one import to it breaks `svelte-check` for every consuming
// app, and nothing in this package's own test run would notice.

const SCOPE_SEPARATOR = '__';

// A token is matched in its camelCase form because that is the only form the registry is keyed
// in (@symbiote-native/css-parser's `extractClassName` always camelCases, so `.card-title`
// registers as `cardTitle`) while markup idiomatically writes the kebab form. A token this file's
// `<style>` block does NOT define is returned VERBATIM, not camelCased — unlike Vue's rewriter,
// which camelCases everything it sees. The engine's `resolveOne` already falls back kebab->camel
// on a miss, so camelCasing here would buy nothing and would silently rename a class the author
// is forwarding to some other file's global rule.
export function scopeToken(
  token: string,
  localNames: ReadonlySet<string>,
  scopeId: string,
): string {
  const camelToken = kebabToCamel(token);
  return localNames.has(camelToken) ? camelToken + SCOPE_SEPARATOR + scopeId : token;
}

// Duplicated from @symbiote-native/css-parser rather than imported, for the same reason
// core/engine/src/style-registry/index.ts duplicates it — plus the import-free constraint above.
export function kebabToCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
