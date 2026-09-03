// Runtime style registry. Side-effect CSS imports (compiled by the sibling CSS-to-style
// build package, not this module) call registerRules() with the token SET each selector
// names; components look them up via resolveClassName(). No CSS parsing here - just an
// inverted Map<token, rules> and a subset test.
//
// A rule matches when its tokens are a SUBSET of the element's class list, in any order and
// at any length, and the matches cascade by (derived-scope, specificity, epoch, order).
// That replaced an earlier flat Map<key, style>, where the compiler COLLAPSED a selector's
// tokens into one camelCase name (`.a.b` -> `aB`) and the runtime guessed the split back
// apart by permuting the class string: 60 built keys on a 4-token miss, a camelCase
// round-trip that could not survive a scope suffix, no real cascade, and a silent cliff at
// 5 tokens where the compound branch stopped running at all. Tokens now arrive AS AUTHORED,
// so there is nothing left to guess.

import type { IViewStyle, ITextStyle } from '../styles';

type IResolvedStyle = Partial<IViewStyle & ITextStyle>;

export type IClassNameValue =
  string | IResolvedStyle | Array<string | IResolvedStyle> | undefined | null;

// The scope tail as OUR OWN compilers emit it — all three shapes, the hash being css-parser's
// base36 hashFilePath:
//   `card__data-v-<h>`   Vue `<style scoped>`
//   `card__svelte-<h>`   Svelte `<style>`
//   `card__module__<h>`  CSS Modules — BOTH a standalone `.module.css` and Vue's `<style module>`
// (A preprocessor source — SCSS/Less/Stylus — reduces to plain CSS before any of this, so it
// carries whichever of the three its host block uses; there is no fourth shape.)
//
// Matched by SHAPE, never by "there is a `__` somewhere in the name" — a BEM class
// (`card__title`) must never be read as a scoped `card`, which would silently merge the block's
// styles into the element's.
//
// Matched as ONE TAIL UNIT anchored at the end, rather than as "split on the last `__`, then
// shape-test what follows": the module form carries its own `__`, so a `lastIndexOf` split cuts
// `badge__module__<h>` into base `badge__module` + scope `<h>` and the base it hands back names
// no class. Widening the shape test alone would NOT fix that — the split POINT is wrong, not the
// alphabet.
//
// Note this suffix scheme is ours, not the frameworks'. Svelte appends a SEPARATE token
// (`class="card svelte-<h>"`) and Vue `<style scoped>` renames nothing at all (it adds a
// `data-v-<h>` attribute). We have no DOM and no attribute matching, so a scope is expressed by
// renaming the token; the names only borrow their vocabulary.
const SCOPE_TAIL_PATTERN = /__((?:data-v|svelte)-[0-9a-z]+|module__[0-9a-z]+)$/;

interface IScopedToken {
  readonly base: string;
  readonly scope: string;
}

function splitScopedToken(token: string): IScopedToken | null {
  const match = SCOPE_TAIL_PATTERN.exec(token);
  // index 0 would mean the token is nothing BUT a scope tail, which names no class.
  if (match === null || match.index <= 0) return null;
  return { base: token.slice(0, match.index), scope: match[1] };
}

// A selector as the compiler hands it over: the tokens themselves, not a name built out of
// them. `.card.big` is `{ tokens: ['card', 'big'], specificity: [0, 2, 0] }` - and it matches an
// element whose class list is a SUPERSET of `tokens`, in any order and at any length.
export interface IStyleRule {
  /** Class names AS AUTHORED / as renamed by the scoping pass. No normalization. */
  readonly tokens: readonly string[];
  readonly specificity: readonly [number, number, number];
  /** Source order within its file; the registry adds a per-registration epoch on top. */
  readonly order: number;
  readonly style: IResolvedStyle;
}

// `order` is only meaningful inside one file, so a rule from a later import has to outrank an
// equally-specific one from an earlier import regardless of its own number - that is what the
// epoch counts. It is CSS's "later import wins" rewritten as a comparable value.
interface IIndexedRule {
  readonly rule: IStyleRule;
  readonly epoch: number;
}

// Inverted index, ONE bucket per rule rather than one per token: a rule can only match when the
// element carries every one of its tokens, so any single token of it is a sufficient hook. The
// alternative (indexing under all of them) surfaces the same rule once per shared token and buys
// nothing but a dedupe pass.
const ruleIndex = new Map<string, IIndexedRule[]>();
let ruleEpoch = 0;

// resolveClassName runs from routeProp on every class-prop WRITE, per node, and a screen only
// ever uses a few dozen distinct class strings — so after warm-up the whole resolution collapses
// to one Map.get. Only the STRING branch is memoized: an object/array argument has no stable key
// (a fresh literal every render) and would just fill the map.
//
// Safe to hand the SAME object out repeatedly because no caller mutates it — every consumer
// (routeProp's commitClassStyle, and the ScrollView / VirtualizedList / FlatList / ImageBackground
// class-to-style props in all five adapters) spreads it or drops it into a style array, and
// flattenStyle shallow-copies.
const resolvedCache = new Map<string, IResolvedStyle>();

// Bounded so a screen generating unique class strings at runtime cannot grow it without limit.
// Overflow drops everything rather than evicting one entry: the cache is a warm-up optimization,
// not a working set, and an LRU's bookkeeping costs more than the rebuild it saves.
const RESOLVED_CACHE_LIMIT = 512;

// The pressed variant, keyed by the SAME authored string. Separate from `resolvedCache` so the two
// can never collide on one key, and string-keyed for the same reason that one is: identity is the
// whole point. `isAlreadyPublished` (node.ts) turns a re-push away by comparing slot 0 with
// Object.is, so a thousand unpressed rows only cost zero writes if they all publish the SAME
// object. Resolve an array or an object instead and every call returns a fresh one, the guard can
// never fire, and the re-push storm it was added for comes back with a new cause.
//
// This doubles the distinct strings a screen can hold. A SECOND state would multiply them, and the
// cache clears WHOLE on overflow rather than evicting — so a drop breaks identity for every node at
// once. That is the wall a `:focus` or `:hover` would hit, and it would read as an unexplained
// regression rather than as a cache limit.
const activeCache = new Map<string, IResolvedStyle>();

// The token the css-parser emits for `:active` (its `STATE_TOKEN`). Duplicated as a literal rather
// than imported: the engine does not depend on the parser, and a CSS identifier cannot carry an
// unescaped `:`, so this can never collide with a real class name.
const STATE_TOKEN = ':active';

// Whether ANY registered rule carries the state token. Not derivable from `ruleIndex`, which hooks
// a rule on `tokens[0]` — for `.btn:active` that is `btn`, so `ruleIndex.has(':active')` is always
// false and a gate built on it silently disables the whole feature. Found by a test, not by
// reading: the wrong gate makes pressing a no-op with everything green.
let hasActiveRules = false;

// Every registration is a cascade change, so nothing resolved before it can be trusted. Clearing
// wholesale beats versioning each entry — registration happens at import time, resolution happens
// per commit, and only the second one is hot.
function invalidateResolved(): void {
  resolvedCache.clear();
  activeCache.clear();
}

export function registerRules(rules: readonly IStyleRule[]): void {
  invalidateResolved();
  const epoch = ruleEpoch++;

  for (const rule of rules) {
    if (rule.tokens.includes(STATE_TOKEN)) hasActiveRules = true;
    const hook = rule.tokens[0];
    // The empty set is a subset of every element's tokens, so a token-less rule would paint
    // everything. It names no class and can only come from a broken compile.
    if (hook === undefined) continue;

    const bucket = ruleIndex.get(hook);
    if (bucket === undefined) {
      ruleIndex.set(hook, [{ rule, epoch }]);
      continue;
    }
    bucket.push({ rule, epoch });
  }
}

// Used between tests to reset registry state.
export function clearGlobalStyles(): void {
  ruleIndex.clear();
  hasActiveRules = false;
  ruleEpoch = 0;
  invalidateResolved();
}

// A `class`/`className` prop arrives as `unknown` at the routeProp boundary (any adapter can
// hand over anything); this narrows before resolveClassName without an `as` cast. Shared with
// adapters/vue/src/components/scroll-view/shared.ts's identical need, rather than each keeping
// its own copy - that file imports this one instead of redeclaring it.
export function isClassNameValue(value: unknown): value is IClassNameValue {
  return (
    typeof value === 'string' || (typeof value === 'object' && value !== null)
  );
}

// An ARRAY of plain strings joined into one, so it takes the memoised string path like any other
// class. Everything downstream keys off identity — `resolveClassName`'s cache, the `:active`
// variant, and `isAlreadyPublished`'s Object.is on slot 0 — and the array branch below reduces
// into a FRESH object on every call, so an array class silently opted out of all three: no pressed
// styling, and a re-push that re-dirties the node on every update.
//
// Only an ALL-STRING array converts. A mixed array carries IResolvedStyle entries — the channel
// ScrollView / VirtualizedList / FlatList / ImageBackground use to pass a style through the class
// prop — and those are not tokens; folding them into a string would be a category error rather
// than a fix. No adapter produces an all-string array today (Vue's createVNode normalises class to
// a string, Angular joins its accumulated tokens, React's className is a string by convention), so
// this closes a gap an APPLICATION can reach rather than one we can.
export function canonicalClassName(
  className: IClassNameValue,
): IClassNameValue {
  if (typeof className === 'string' || !Array.isArray(className)) {
    return className;
  }
  return className.every(part => typeof part === 'string')
    ? className.join(' ')
    : className;
}

export function resolveClassName(className: IClassNameValue): IResolvedStyle {
  if (!className) return {};

  if (typeof className === 'object' && !Array.isArray(className)) {
    return className;
  }

  if (Array.isArray(className)) {
    // Direct callers (an adapter resolving a class prop itself) get the same canonicalisation as
    // routeProp's path, so an all-string array is memoised for them too.
    const canonical = canonicalClassName(className);
    if (typeof canonical === 'string') return resolveClassName(canonical);
    return className.reduce<IResolvedStyle>((acc, item) => {
      return { ...acc, ...resolveClassName(item) };
    }, {});
  }

  const cached = resolvedCache.get(className);
  if (cached !== undefined) return cached;

  const resolved = resolveClassString(className);

  if (resolvedCache.size >= RESOLVED_CACHE_LIMIT) resolvedCache.clear();
  resolvedCache.set(className, resolved);

  return resolved;
}

// The same element's style with `:active` added to its token list — so a `.btn:active` rule joins
// the cascade exactly as its specificity says, merged by the SAME matcher. That makes the result a
// complete REPLACEMENT for the unpressed style rather than an overlay, which is why no extra style
// slot is needed on the node: pressing swaps what sits in slot 0.
//
// Non-string input resolves to the plain style, unchanged. An object or array has no stable key to
// cache under, and the guard above is worthless without one.
export function resolveActiveClassName(
  className: IClassNameValue,
): IResolvedStyle {
  if (typeof className !== 'string') return resolveClassName(className);
  // No `:active` rule anywhere in the app — hand back the very SAME object the unpressed path
  // returns, not an equal one. Two cache keys give two objects even when their contents are
  // byte-identical, and `isAlreadyPublished` compares with Object.is: pressing a node that has no
  // pressed styling would otherwise publish a fresh base, dirty the node and pay a walk for a
  // payload Fabric then rejects as unchanged. One node rather than a thousand, so not a storm —
  // but it is a cost for literally nothing, and this makes the whole feature free for every app
  // that does not use it.
  if (!hasActiveRules) return resolveClassName(className);

  const cached = activeCache.get(className);
  if (cached !== undefined) return cached;

  const parts = className.trim().split(/\s+/).filter(Boolean);
  const resolved =
    parts.length === 0 ? {} : (matchRules([...parts, STATE_TOKEN]) ?? {});

  if (activeCache.size >= RESOLVED_CACHE_LIMIT) activeCache.clear();
  activeCache.set(className, resolved);

  return resolved;
}

function resolveClassString(className: string): IResolvedStyle {
  const parts = className.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};

  return matchRules(parts) ?? {};
}

// `derivedTokens` counts the rule's tokens the element does NOT literally carry — the ones it
// only matched through a scoped base (see elementTokens). It ranks BEFORE specificity, and that
// is what keeps a scoped rule layered over the global rule of the same name no matter which file
// registered first. It is also the specificity the rename ate: on the web the element carries
// `class="card svelte-h"` and the component's rule is `.card.svelte-h`, one class MORE specific
// than App.css's `.card`. We express the scope by renaming the token instead, so the two rules
// arrive with the same declared (a,b,c) and the tie has to be broken here.
interface IRuleMatch {
  readonly indexed: IIndexedRule;
  readonly derivedTokens: number;
}

// `null` rather than `{}` for "nothing matched", so the caller can skip the empty-object churn on
// every class-prop set that has no rules.
function matchRules(parts: string[]): IResolvedStyle | null {
  const literal = new Set(parts);
  const tokens = elementTokens(parts);
  let matched: IRuleMatch[] | null = null;

  for (const token of tokens) {
    const bucket = ruleIndex.get(token);
    if (bucket === undefined) continue;

    for (const indexed of bucket) {
      if (!indexed.rule.tokens.every(needed => tokens.has(needed))) continue;
      matched ??= [];
      matched.push({
        indexed,
        derivedTokens: indexed.rule.tokens.filter(token => !literal.has(token))
          .length,
      });
    }
  }

  if (matched === null) return null;

  matched.sort(byCascadeOrder);
  return matched.reduce<IResolvedStyle>(
    (acc, match) => ({ ...acc, ...match.indexed.rule.style }),
    {},
  );
}

// A scoped token contributes its BASE as well: the scope is expressed by RENAMING the token
// rather than adding a second one, so a global `.card` in App.css only survives a component
// defining its own `.card` if the base is put back into the set here. On the web the element
// would carry both names and no such step would exist.
function elementTokens(parts: string[]): ReadonlySet<string> {
  const tokens = new Set<string>();

  for (const part of parts) {
    tokens.add(part);
    const split = splitScopedToken(part);
    if (split !== null) tokens.add(split.base);
  }

  return tokens;
}

// Ascending, because the caller merges left to right: the winner has to be spread LAST. Ties
// break the way the cascade does — later import first, then later line in the file.
function byCascadeOrder(left: IRuleMatch, right: IRuleMatch): number {
  if (left.derivedTokens !== right.derivedTokens) {
    return right.derivedTokens - left.derivedTokens;
  }

  const leftRule = left.indexed.rule;
  const rightRule = right.indexed.rule;

  for (let index = 0; index < leftRule.specificity.length; index++) {
    const diff = leftRule.specificity[index] - rightRule.specificity[index];
    if (diff !== 0) return diff;
  }

  return left.indexed.epoch === right.indexed.epoch
    ? leftRule.order - rightRule.order
    : left.indexed.epoch - right.indexed.epoch;
}
