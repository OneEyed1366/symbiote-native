// Runtime style registry. Side-effect CSS imports (compiled by the sibling CSS-to-style
// build package, not this module) call registerRules() with the token SET each selector
// names; components look them up via resolveClassName(). No CSS parsing here - just an
// inverted Map<token, rules> and a subset test.
//
// A rule matches when its tokens are a subset of the element's classes, in any order
// Tokens arrive as authored, т.к. a key collapsed from them could not be split back reliably

import type { IViewStyle, ITextStyle } from '../styles';
import { hasVariants, mergeStyle } from './variants';

type IResolvedStyle = Partial<IViewStyle & ITextStyle>;

export type IClassNameValue =
  string | IResolvedStyle | Array<string | IResolvedStyle> | undefined | null;

// The scope tail our compilers emit: `card__data-v-<h>` (Vue scoped), `card__svelte-<h>`,
// `card__module__<h>` (CSS Modules), the hash being the css-parser `hashFilePath`
// Matched by shape as one tail, т.к. a BEM `card__title` is no scope and the module form has a `__`
const SCOPE_TAIL_PATTERN = /__((?:data-v|svelte)-[0-9a-z]+|module__[0-9a-z]+)$/;

type IScopedToken = {
  readonly base: string;
  readonly scope: string;
};

function splitScopedToken(token: string): IScopedToken | null {
  const match = SCOPE_TAIL_PATTERN.exec(token);
  // index 0 would mean the token is nothing BUT a scope tail, which names no class.
  if (match === null || match.index <= 0) return null;
  return { base: token.slice(0, match.index), scope: match[1] };
}

// A selector as the compiler hands it over: the tokens themselves, not a name built out of
// them. `.card.big` is `{ tokens: ['card', 'big'], specificity: [0, 2, 0] }` - and it matches an
// element whose class list is a SUPERSET of `tokens`, in any order and at any length.
export type IStyleRule = {
  /** Class names AS AUTHORED / as renamed by the scoping pass. No normalization. */
  readonly tokens: readonly string[];
  readonly specificity: readonly [number, number, number];
  /** Source order within its file; the registry adds a per-registration epoch on top. */
  readonly order: number;
  readonly style: IResolvedStyle;
};

// `order` is only meaningful inside one file, so a rule from a later import has to outrank an
// equally-specific one from an earlier import regardless of its own number - that is what the
// epoch counts. It is CSS's "later import wins" rewritten as a comparable value.
type IIndexedRule = {
  readonly rule: IStyleRule;
  readonly epoch: number;
};

// Inverted index, ONE bucket per rule rather than one per token: a rule can only match when the
// element carries every one of its tokens, so any single token of it is a sufficient hook. The
// alternative (indexing under all of them) surfaces the same rule once per shared token and buys
// nothing but a dedupe pass.
const ruleIndex = new Map<string, IIndexedRule[]>();
let ruleEpoch = 0;

// `resolveClassName` runs on every class-prop write, so after warm-up it is one `Map.get`
// Only the string branch is memoized: an object or array has no stable key
// The same object is handed out each time, т.к. every consumer spreads it or copies it
const resolvedCache = new Map<string, IResolvedStyle>();

// Bounded so a screen generating unique class strings at runtime cannot grow it without limit.
// Overflow evicts ONE entry at random — see `memoise` for why random and not the obvious
// alternatives. It used to drop everything, which turned a working set one entry too wide into a
// total miss on every lookup.
const RESOLVED_CACHE_LIMIT = 512;

// Whether a registered rule holds a value with states, which the host paints as its base
let isAnyRuleWithStates = false;

export function hasRulesWithStates(): boolean {
  return isAnyRuleWithStates;
}

// Every registration is a cascade change, so nothing resolved before it can be trusted. Clearing
// wholesale beats versioning each entry — registration happens at import time, resolution happens
// per commit, and only the second one is hot.
function invalidateResolved(): void {
  resolvedCache.clear();
  resolvedKeys.length = 0;
}

// The victim pool of the cache: the keys it holds, so a random eviction is an index, not a scan
const resolvedKeys: string[] = [];

/**
 * Memoise, evicting a RANDOM entry when full.
 *
 * WHY RANDOM, since it looks arbitrary next to the obvious answers. The policy this replaced dropped
 * the whole cache on overflow, and the reflex repair — evict the oldest — is no better on the access
 * pattern that actually hurts. A working set slightly WIDER than the cache, walked in order, is
 * Belady's worst case: FIFO and LRU each evict exactly the entry the next lookup wants, so both miss
 * on every single access, exactly as the full clear did. Measured on a 512-entry cache cycling 513
 * distinct class strings: clear 0%, FIFO 0%, random 94.7% (`cache-cliff.probe.test.ts`).
 *
 * Random also answers the objection that ruled LRU out here — it needs LESS bookkeeping, not more.
 * There is no recency to maintain; a key array and a swap-remove is the whole of it.
 *
 * The cache stays a pure memo of a pure function either way, so which entries survive changes only
 * which lookups pay the rebuild. `invalidateResolved` still drops everything when the cascade moves,
 * because then nothing resolved earlier is true any more.
 */
function memoise(
  cache: Map<string, IResolvedStyle>,
  keys: string[],
  key: string,
  value: IResolvedStyle,
): void {
  if (cache.size >= RESOLVED_CACHE_LIMIT) {
    const victimAt = Math.floor(Math.random() * keys.length);
    const victim = keys[victimAt];
    if (victim !== undefined) {
      cache.delete(victim);
      const last = keys.pop();
      if (last !== undefined && victimAt < keys.length) keys[victimAt] = last;
    }
  }
  cache.set(key, value);
  keys.push(key);
}

export function registerRules(rules: readonly IStyleRule[]): void {
  invalidateResolved();
  const epoch = ruleEpoch++;

  for (const rule of rules) {
    if (hasVariants(rule.style)) isAnyRuleWithStates = true;
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
  isAnyRuleWithStates = false;
  ruleEpoch = 0;
  invalidateResolved();
}

// A class prop arrives as `unknown` at the `routeProp` boundary, so this narrows it without `as`
// The Vue scroll-view shares it instead of keeping a copy
export function isClassNameValue(value: unknown): value is IClassNameValue {
  return (
    typeof value === 'string' || (typeof value === 'object' && value !== null)
  );
}

// An array of plain strings joins into one, so it takes the memoised string path
// A mixed array carries style objects (the list components pass a style that way) and stays as is
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

// The one object every "this class styles nothing" answer hands back
// A fresh `{}` would defeat the `Object.is` check of `isAlreadyPublished` and read as a real style
export const EMPTY_STYLE: IResolvedStyle = Object.freeze({});

export function resolveClassName(className: IClassNameValue): IResolvedStyle {
  if (!className) return EMPTY_STYLE;

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

  memoise(resolvedCache, resolvedKeys, className, resolved);

  return resolved;
}

// Класс и inline-стиль для обёртки, читающей значения в JS, т.к. один `style` не видит класс
export function styleOfProps(props: object): readonly [unknown, unknown] {
  const className: unknown =
    Reflect.get(props, 'className') ?? Reflect.get(props, 'class');
  const classStyle = isClassNameValue(className)
    ? resolveClassName(canonicalClassName(className))
    : undefined;
  return [classStyle, Reflect.get(props, 'style')];
}

function resolveClassString(className: string): IResolvedStyle {
  const parts = className.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return EMPTY_STYLE;

  return matchRules(parts) ?? EMPTY_STYLE;
}

// `derivedTokens` counts the rule's tokens the element does NOT literally carry — the ones it
// only matched through a scoped base (see elementTokens). It ranks BEFORE specificity, and that
// is what keeps a scoped rule layered over the global rule of the same name no matter which file
// registered first. It is also the specificity the rename ate: on the web the element carries
// `class="card svelte-h"` and the component's rule is `.card.svelte-h`, one class MORE specific
// than App.css's `.card`. We express the scope by renaming the token instead, so the two rules
// arrive with the same declared (a,b,c) and the tie has to be broken here.
type IRuleMatch = {
  readonly indexed: IIndexedRule;
  readonly derivedTokens: number;
};

// `null` rather than `{}` for "nothing matched", so the caller can skip the empty-object churn on
// every class-prop set that has no rules.
function matchRules(parts: string[]): IResolvedStyle | null {
  const literal = new Set(parts);
  const tokens = elementTokens(parts);
  let matched: IRuleMatch[] | null = null;

  for (const hook of tokens) {
    const bucket = ruleIndex.get(hook);
    if (bucket === undefined) continue;

    for (const indexed of bucket) {
      if (!indexed.rule.tokens.every(needed => tokens.has(needed))) continue;
      matched ??= [];
      matched.push({
        indexed,
        derivedTokens: indexed.rule.tokens.filter(name => !literal.has(name))
          .length,
      });
    }
  }

  if (matched === null) return null;

  matched.sort(byCascadeOrder);
  return matched.reduce<IResolvedStyle>(
    (acc, match) => mergeStyle(acc, match.indexed.rule.style),
    {},
  );
}

// A scoped token contributes its base as well, so a global `.card` still matches an element
// whose component renamed its own `.card` to a scoped token
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
