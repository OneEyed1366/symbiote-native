// Runtime style registry. Side-effect CSS imports (compiled by the sibling CSS-to-style
// build package, not this module) call registerStyles() with camelCase keys; components
// look them up via resolveClassName(). No CSS parsing here - just a Map<string, ...> lookup.
//
// No Tailwind-utility detection layer: this repo's style surface has no Tailwind layer,
// so the compound lookup below always runs for 2-4-part class strings instead of being
// gated behind "no part looks like a utility class".
//
// kebab-case authoring: a CSS selector `.section-label` always registers under the
// camelCase key `sectionLabel` (@symbiote-native/css-parser's extractClassName), so a template
// can write EITHER `class="sectionLabel"` OR `class="section-label"` - resolveOne below
// falls back to the kebab->camel form on a miss, since authors don't reliably write the
// exact camelCase key.

import type { IViewStyle, ITextStyle } from '../styles';

type IResolvedStyle = Partial<IViewStyle & ITextStyle>;

export type IClassNameValue =
  string | IResolvedStyle | Array<string | IResolvedStyle> | undefined | null;

// Compound lookup tries every ordering of 2-4 space-separated class parts (e.g. "btn primary"
// -> "btnPrimary" / "primaryBtn"), mirroring CSS compound-selector registration
// (`.btn.primary { }`), and layers whatever it finds ON TOP of the per-class merge.
const COMPOUND_MIN_PARTS = 2;
const COMPOUND_MAX_PARTS = 4;

// A scope suffix as the `<style scoped>` compilers emit it: `card__data-v-1a2b3c4d` (Vue) or
// `card__svelte-1a2b3c4d` (Svelte), the hash being css-parser's base36 hashFilePath. Matched by
// SHAPE, never by "there is a `__` somewhere in the name" — a BEM class (`card__title`) must
// never be read as a scoped `card`, which would silently merge the block's styles into the
// element's.
const SCOPE_SEPARATOR = '__';
const SCOPE_SUFFIX_PATTERN = /^(?:data-v|svelte)-[0-9a-z]+$/;

interface IScopedToken {
  readonly base: string;
  readonly scope: string;
}

function splitScopedToken(token: string): IScopedToken | null {
  const separator = token.lastIndexOf(SCOPE_SEPARATOR);
  if (separator <= 0) return null;
  const scope = token.slice(separator + SCOPE_SEPARATOR.length);
  if (!SCOPE_SUFFIX_PATTERN.test(scope)) return null;
  return { base: token.slice(0, separator), scope };
}

const globalStyles = new Map<string, IResolvedStyle>();

// Called by generated code from side-effect style imports. Last import wins on a
// name collision, matching CSS cascade behavior.
export function registerStyles(styles: Record<string, IResolvedStyle>): void {
  for (const [name, style] of Object.entries(styles)) {
    globalStyles.set(name, style);
  }
}

// Used between tests to reset registry state.
export function clearGlobalStyles(): void {
  globalStyles.clear();
}

// A `class`/`className` prop arrives as `unknown` at the routeProp boundary (any adapter can
// hand over anything); this narrows before resolveClassName without an `as` cast. Shared with
// adapters/vue/src/components/scroll-view/shared.ts's identical need, rather than each keeping
// its own copy - that file imports this one instead of redeclaring it.
export function isClassNameValue(value: unknown): value is IClassNameValue {
  return typeof value === 'string' || (typeof value === 'object' && value !== null);
}

export function resolveClassName(className: IClassNameValue): IResolvedStyle {
  if (!className) return {};

  if (typeof className === 'object' && !Array.isArray(className)) {
    return className;
  }

  if (Array.isArray(className)) {
    return className.reduce<IResolvedStyle>((acc, item) => {
      return { ...acc, ...resolveClassName(item) };
    }, {});
  }

  const trimmed = className.trim();
  if (!trimmed) return {};

  const parts = trimmed.split(/\s+/).filter(Boolean);

  // A single token is nothing but the exact-match lookup, so it goes through resolveOne, which
  // adds the scoped-token base layering below. A multi-token string still tries the whole string
  // as one key first — `$style.card`-style output arrives pre-resolved and must not be split.
  if (parts.length <= 1) return resolveOne(trimmed);

  const exactMatch = lookupKey(trimmed);
  if (exactMatch) return exactMatch;

  const merged = parts.reduce<IResolvedStyle>((acc, cls) => {
    return { ...acc, ...resolveOne(cls) };
  }, {});

  // A compound rule LAYERS OVER the single-class rules rather than replacing them, matching the
  // cascade: `.card { padding: 8; background: white }` + `.card.big { padding: 16 }` on
  // `class="card big"` is padding 16 AND background white. Returning the compound alone (what
  // this did before) silently dropped every property the compound did not itself restate.
  if (parts.length >= COMPOUND_MIN_PARTS && parts.length <= COMPOUND_MAX_PARTS) {
    const compound = tryCompoundLookup(parts);
    if (compound) return { ...merged, ...compound };
  }

  return merged;
}

function generateCompoundPermutations(parts: string[]): string[][] {
  if (parts.length < COMPOUND_MIN_PARTS) return [];

  const compounds: string[][] = [];
  for (let size = COMPOUND_MIN_PARTS; size <= parts.length; size++) {
    compounds.push(...generateKPermutations(parts, size));
  }
  return compounds;
}

function generateKPermutations(parts: string[], size: number): string[][] {
  if (size === 0) return [[]];
  if (parts.length === 0) return [];

  const result: string[][] = [];

  function helper(current: string[], remaining: string[], depth: number): void {
    if (depth === size) {
      result.push(current);
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      helper(
        [...current, remaining[i]],
        remaining.slice(0, i).concat(remaining.slice(i + 1)),
        depth + 1,
      );
    }
  }

  helper([], parts, 0);
  return result;
}

// Compound permutations join as camelCase ("btn primary" -> "btnPrimary") because this
// repo's CSS-to-style compiler emits plain camelCase keys for every class, single or
// compound, so "btn primary" must resolve against a registered "btnPrimary".
function toCompoundKey(parts: string[]): string {
  return parts.reduce((key, part, index) => (index === 0 ? part : key + capitalize(part)), '');
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

// Duplicated from @symbiote-native/css-parser's identical helper rather than imported: css-parser
// pulls in postcss and is build-time only (never shipped in the app bundle), and this registry
// is the opposite - pure runtime, in every app bundle - so importing it here would leak a
// build-time dependency into the shipped app. The conversion itself is two lines; keeping both
// copies in sync is a smaller cost than the alternative.
//
// Exported (not just local to this file) because ./scope.ts's Vue `<style scoped>` name
// rewriter needs the same kebab->camel normalization and is a different responsibility living
// in a sibling module - see that file's own doc comment for why it's split out of this one.
export function kebabToCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function tryCompoundLookup(parts: string[]): IResolvedStyle | null {
  if (parts.length < COMPOUND_MIN_PARTS) return null;

  for (const subset of generateCompoundPermutations(parts)) {
    for (const key of compoundKeysFor(subset)) {
      const style = globalStyles.get(key);
      if (style) return style;
    }
  }

  return null;
}

function compoundKeysFor(subset: string[]): string[] {
  const scoped = scopedCompoundKey(subset);
  return scoped === null ? [toCompoundKey(subset)] : [toCompoundKey(subset), scoped];
}

// The scope suffix is appended per TOKEN in the markup (`class="card__svelte-h big__svelte-h"`)
// but appears ONCE, at the end, in the registered key a compound rule produces
// (`.card.big` -> `cardBig__svelte-h`) — the compiler collapses the selector to one name and
// suffixes that. Those two operations do not commute, so the key built from the raw tokens
// (`card__svelte-hBig__svelte-h`) can never match and every scoped compound rule was dead.
// Rebuild the key the way registration did: strip the suffix, join the bases, re-append once.
//
// An UNSCOPED token in the subset contributes its own name and no scope, rather than aborting.
// That is the `:global()` case, and it is why a partial `:global()` reaches the markup it was
// written for: `.card :global(.reset)` registers the key `cardReset`, which the scoper suffixes
// as a whole (the escape hatch exempts the `reset` MARKUP TOKEN, not the collapsed key), while
// the element carries `card__svelte-h reset`. The same shape covers a class handed down from a
// parent component, which likewise arrives unsuffixed.
//
// Widening, stated so it stays deliberate: a fully-scoped `.card.reset` collapses to that same
// key, so an element carrying a FOREIGN `reset` now matches a rule the author scoped to their
// own. The key format cannot tell the two apart — telling them apart needs a registry indexed by
// token set, with per-token scope. The scopes still have to agree: two tokens from two different
// components have no single suffix to factor out and stay unmatched.
function scopedCompoundKey(subset: string[]): string | null {
  const bases: string[] = [];
  let scope: string | undefined;

  for (const token of subset) {
    const split = splitScopedToken(token);
    if (split === null) {
      bases.push(token);
      continue;
    }
    if (scope !== undefined && split.scope !== scope) return null;
    scope = split.scope;
    bases.push(split.base);
  }

  return scope === undefined ? null : toCompoundKey(bases) + SCOPE_SEPARATOR + scope;
}

// A scoped token layers over its own unscoped name: on the web the element carries BOTH classes
// (`class="card svelte-h"`), so a global `.card` in App.css still applies underneath the
// component's `<style>` rule. Rewriting `card` -> `card__svelte-h` here is how the scope is
// expressed instead of a second class, so the base has to be re-consulted explicitly or that
// global rule silently disappears the moment a component defines a class of the same name.
function resolveOne(name: string): IResolvedStyle {
  const trimmed = name.trim();
  if (!trimmed) return {};

  const scoped = lookupKey(trimmed);
  const split = splitScopedToken(trimmed);
  if (split === null) return scoped ?? {};

  return { ...lookupKey(split.base), ...scoped };
}

function lookupKey(name: string): IResolvedStyle | undefined {
  return globalStyles.get(name) ?? globalStyles.get(kebabToCamel(name));
}
