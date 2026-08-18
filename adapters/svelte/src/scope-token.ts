// The `<style>`-scoping rule for ONE class token, and nothing else: a lookup in the name map
// @symbiote-native/css-parser built out of lightningcss's `exports`. A token the map does not
// carry is one this file's `<style>` block never renamed — a `:global(...)` name, or a class
// forwarded from somewhere else — and is returned VERBATIM.
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

/** Authored class name -> the name it registers under. One spelling: nothing camelCases now. */
export type IScopedNames = ReadonlyMap<string, string>;

export function scopeToken(token: string, names: IScopedNames): string {
  return names.get(token) ?? token;
}
