// Class-name rewriter for scoped styles. Distinct responsibility from the sibling ./index.ts
// (the CSS class -> style registry): this module does pure NAME rewriting, no registry lookup,
// no CSS parsing. It runs at the compiled call site of a scoped-style template -
// `adapters/vue/metro-vue-transformer.cjs` emits calls to renameClassTokens (imported there as
// `__scopeClass`) - BEFORE Vue's own normalizeClass() collapses string/object/array `class`
// values to a final string, so it must pre-process all three shapes normalizeClass understands.
// resolveClassName in ./index.ts still does the actual style lookup, unchanged, against the
// rewritten name.

export type IClassToggleMap = Record<string, boolean | undefined>;

export type IScopableClassValue =
  string | IClassToggleMap | Array<string | IClassToggleMap> | undefined | null;

// A compile-time table of authored class name -> the name it was RENAMED to, carrying both the
// authored spelling and its camelCase alias so either survives a lookup.
export type IClassNameRenames = Readonly<Record<string, string>>;

/**
 * Rewrites every class token the style compiler renamed, leaving the rest alone.
 *
 * The names come from the compiler's own rename table, emitted verbatim, rather than being
 * RECOMPUTED here as `token + '__' + scopeId`. Recomputing made the runtime a second,
 * independent implementation of "what is this class called now" beside the style compiler —
 * they agreed by construction until a rename mechanism changed under one of them. lightningcss
 * renames the class; this reads the result.
 *
 * A token absent from the table is left alone: it belongs to another file (a `:global()` escape
 * hatch, App.css, a class handed down by a parent), and the registry resolves it under its own
 * authored name.
 */
export function renameClassTokens(
  value: IScopableClassValue,
  renames: IClassNameRenames,
): IScopableClassValue {
  if (value === undefined || value === null) return value;

  if (Array.isArray(value)) {
    return value.map(item => renameClassEntry(item, renames));
  }

  return renameClassEntry(value, renames);
}

function renameClassEntry(
  value: string | IClassToggleMap,
  renames: IClassNameRenames,
): string | IClassToggleMap {
  if (typeof value === 'object') {
    const renamed: IClassToggleMap = {};
    for (const [name, enabled] of Object.entries(value)) {
      renamed[renames[name] ?? name] = enabled;
    }
    return renamed;
  }

  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(token => renames[token] ?? token)
    .join(' ');
}
