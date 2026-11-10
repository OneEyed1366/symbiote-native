// Runtime style registry: compiled CSS imports call `registerRules`, components `resolveClassName`
// A rule matches when its tokens are a subset of the element's classes, in any order and length,
// and matches cascade by derived scope, specificity, epoch and source order

import type { IViewStyle, ITextStyle } from '../styles';
import {
  conditionIdsOfKey,
  dependentKeys,
  forgetDependents,
  holdsCondition,
  internConditions,
  isContainerCondition,
  resetConditions,
  settledConditionOf,
  trackDependents,
  untrackDependents,
  updateEnvironment,
} from './media-conditions';
import type {
  IContainerLookup,
  IMediaCondition,
  IMediaEnvironment,
  ISettledCondition,
} from './media-evaluate';
import { clearRootVariables, publishRootVariables } from './root-variables';
import { hasVariants, mergeStyle } from './variants';

export { registerRootVariables, rootVariableTable } from './root-variables';
export type { IRootVariable } from './root-variables';

type IResolvedStyle = Partial<IViewStyle & ITextStyle>;

export type IClassNameValue =
  string | IResolvedStyle | Array<string | IResolvedStyle> | undefined | null;

// Scope tail our compilers emit: `card__data-v-<h>` (Vue), `card__svelte-<h>`, `card__module__<h>`
// Matched as one tail unit anchored at the end, so BEM `card__title` is no scope and
// `badge__module__<h>` does not split at its inner `__`
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
  /** Index into the `conditions` passed to `registerRules` with this rule */
  readonly cond?: number;
};

// `order` is only meaningful inside one file, so a rule from a later import has to outrank an
// equally-specific one from an earlier import regardless of its own number - that is what the
// epoch counts. It is CSS's "later import wins" rewritten as a comparable value.
type IIndexedRule = {
  readonly rule: IStyleRule;
  readonly epoch: number;
  /** The global id of the rule's `@media` condition, when it has one */
  readonly condId?: number;
};

// Inverted index, ONE bucket per rule rather than one per token: a rule can only match when the
// element carries every one of its tokens, so any single token of it is a sufficient hook. The
// alternative (indexing under all of them) surfaces the same rule once per shared token and buys
// nothing but a dedupe pass.
const ruleIndex = new Map<string, IIndexedRule[]>();
let ruleEpoch = 0;

// Memo of `resolveClassName` by class string, since an object argument has no stable key
// The same object is handed out each time: consumers spread it or copy it, none mutate it
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
  variantsCache.clear();
  variantsKeys.length = 0;
  forgetDependents();
}

// The victim pool of each cache below: a plain array of its keys, so a random eviction is an index
// rather than a scan, and nothing about recency or order is tracked
const resolvedKeys: string[] = [];
const variantsKeys: string[] = [];

/**
 * Memoise, evicting a RANDOM entry when full, since a working set one wider than the cache makes
 * FIFO and LRU miss on every lookup (`cache-cliff.probe.test.ts`)
 */
function memoise<TValue>(
  cache: Map<string, TValue>,
  keys: string[],
  key: string,
  value: TValue,
): void {
  if (cache.size >= RESOLVED_CACHE_LIMIT) {
    const victimAt = Math.floor(Math.random() * keys.length);
    const victim = keys[victimAt];
    if (victim !== undefined) {
      cache.delete(victim);
      forgetIfUncached(victim);
      const last = keys.pop();
      if (last !== undefined && victimAt < keys.length) keys[victimAt] = last;
    }
  }
  cache.set(key, value);
  keys.push(key);
}

export function registerRules(
  rules: readonly IStyleRule[],
  conditions: readonly IMediaCondition[] = [],
): void {
  invalidateResolved();
  const epoch = ruleEpoch++;
  const conditionIds = internConditions(conditions);

  for (const rule of rules) {
    const condId =
      rule.cond === undefined ? undefined : conditionIds[rule.cond];
    // A condition the table lacks is an unknown one, so the rule never applies
    if (rule.cond !== undefined && condId === undefined) continue;
    if (hasVariants(rule.style)) isAnyRuleWithStates = true;
    const hook = rule.tokens[0];
    // The empty set is a subset of every element's tokens, so a token-less rule would paint
    // everything. It names no class and can only come from a broken compile.
    if (hook === undefined) continue;

    const bucket = ruleIndex.get(hook);
    if (bucket === undefined) {
      ruleIndex.set(hook, [{ rule, epoch, condId }]);
      continue;
    }
    bucket.push({ rule, epoch, condId });
  }
}

// Used between tests to reset registry state.
export function clearGlobalStyles(): void {
  ruleIndex.clear();
  isAnyRuleWithStates = false;
  ruleEpoch = 0;
  clearRootVariables();
  resetConditions();
  invalidateResolved();
}

// A string no cache holds needs no tracking, so the tables follow the bound of the caches
function forgetIfUncached(key: string): void {
  if (!resolvedCache.has(key)) untrackDependents(key);
}

function dropCached(
  cache: Map<string, IResolvedStyle>,
  keys: string[],
  key: string,
): void {
  if (!cache.delete(key)) return;
  forgetIfUncached(key);
  const at = keys.indexOf(key);
  const last = keys.pop();
  if (last !== undefined && at < keys.length) keys[at] = last;
}

// Hands the registry a new snapshot and returns the condition ids that flipped
// Only the cache entries that read a flipped condition are dropped, the rest keep their identity
export function setMediaEnvironment(env: IMediaEnvironment): readonly number[] {
  const flipped = updateEnvironment(env);
  for (const key of dependentKeys(flipped)) {
    dropCached(resolvedCache, resolvedKeys, key);
  }
  if (flipped.length > 0) {
    variantsCache.clear();
    variantsKeys.length = 0;
    publishRootVariables();
  }
  return flipped;
}

// The condition ids a class value read when it resolved, which is what a node subscribes to
// A string reads its own key and an array the union of its items, an object reads nothing
export function conditionIdsOf(className: IClassNameValue): readonly number[] {
  if (typeof className === 'string') {
    return [...(conditionIdsOfKey(className) ?? [])];
  }
  if (!Array.isArray(className)) return [];
  return [...new Set(className.flatMap(item => conditionIdsOf(item)))];
}

// Narrows the `unknown` a `class` prop arrives as at the `routeProp` boundary, without an `as` cast
// The Vue scroll-view helper imports this instead of keeping its own copy
export function isClassNameValue(value: unknown): value is IClassNameValue {
  return (
    typeof value === 'string' || (typeof value === 'object' && value !== null)
  );
}

// An all-string array joins into one string, so it takes the memoised path and keeps identity
// A mixed array carries style objects that wrappers pass through the class prop, not tokens
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

/**
 * The one object every "this class styles nothing" answer hands back
 *
 * Shared, so `isAlreadyPublished` sees an unchanged slot 0 and `pushClassStyle` can tell nothing
 * from something. Frozen, since a caller that mutated it would corrupt every such node
 */
export const EMPTY_STYLE: IResolvedStyle = Object.freeze({});

// A node with a container resolves its `@container` rules by that container's size
export function resolveClassName(
  className: IClassNameValue,
  containerOf?: IContainerLookup,
): IResolvedStyle {
  if (!className) return EMPTY_STYLE;

  if (typeof className === 'object' && !Array.isArray(className)) {
    return className;
  }

  if (Array.isArray(className)) {
    // Direct callers (an adapter resolving a class prop itself) get the same canonicalisation as
    // routeProp's path, so an all-string array is memoised for them too.
    const canonical = canonicalClassName(className);
    if (typeof canonical === 'string') return resolveClassName(canonical, containerOf);
    return className.reduce<IResolvedStyle>((acc, item) => {
      return { ...acc, ...resolveClassName(item, containerOf) };
    }, {});
  }

  const cached = resolvedCache.get(className);
  if (cached !== undefined) return resolveForContainer(className, cached, containerOf);

  const resolved = resolveClassString(className);

  memoise(resolvedCache, resolvedKeys, className, resolved);

  return resolveForContainer(className, resolved, containerOf);
}

// The key part that tells the container-dependent variants of one class apart
const CONTAINER_KEY_SEPARATOR = '\u0001';

// `plain` is the answer with every container rule off. A class whose container conditions all fail
// keeps handing that same object out, and the others cache one variant per set of true conditions
function resolveForContainer(
  className: string,
  plain: IResolvedStyle,
  containerOf: IContainerLookup | undefined,
): IResolvedStyle {
  if (containerOf === undefined) return plain;
  const ids = [...(conditionIdsOfKey(className) ?? [])].filter(isContainerCondition);
  const bits = ids.map(id => (holdsCondition(id, containerOf) ? '1' : '0')).join('');
  if (!bits.includes('1')) return plain;

  const key = `${className}${CONTAINER_KEY_SEPARATOR}${bits}`;
  const cached = resolvedCache.get(key);
  if (cached !== undefined) return cached;

  const deps = new Set<number>();
  const parts = className.trim().split(/\s+/).filter(Boolean);
  const resolved =
    matchRules(parts, deps, id => holdsCondition(id, containerOf)) ?? EMPTY_STYLE;
  memoise(resolvedCache, resolvedKeys, key, resolved);
  trackDependents(key, deps);
  return resolved;
}

export type IContainerVariants = readonly [
  readonly ISettledCondition[],
  ...(readonly [number, IResolvedStyle])[],
];

// A host that evaluates container queries by itself gets 16 styles at most for one class
const MAX_VARIANT_CONDITIONS = 4;
const variantsCache = new Map<string, IContainerVariants | undefined>();

function buildContainerVariants(className: string): IContainerVariants | undefined {
  resolveClassName(className);
  const ids = [...(conditionIdsOfKey(className) ?? [])].filter(isContainerCondition);
  if (ids.length === 0 || ids.length > MAX_VARIANT_CONDITIONS) return undefined;
  const parts = className.trim().split(/\s+/).filter(Boolean);
  const styles: Array<readonly [number, IResolvedStyle]> = [];
  for (let mask = 1; mask < 1 << ids.length; mask += 1) {
    const holds: IConditionOracle = id => {
      const at = ids.indexOf(id);
      return at < 0 ? holdsCondition(id) : ((mask >> at) & 1) === 1;
    };
    styles.push([mask, matchRules(parts, undefined, holds) ?? EMPTY_STYLE]);
  }
  return [ids.map(settledConditionOf), ...styles];
}

/**
 * The conditions of the class with the window settled, then one `[mask, style]` per way they can
 * hold; bit `i` of a mask is condition `i`. `undefined` for a class without container conditions
 */
export function containerVariantsOf(className: string): IContainerVariants | undefined {
  if (variantsCache.has(className)) return variantsCache.get(className);
  const built = buildContainerVariants(className);
  memoise(variantsCache, variantsKeys, className, built);
  return built;
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

  const deps = new Set<number>();
  const resolved = matchRules(parts, deps) ?? EMPTY_STYLE;
  trackDependents(className, deps);
  return resolved;
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

// A conditional rule is recorded in `deps` even while false, since a flip can turn it on
function holdsRule(
  indexed: IIndexedRule,
  deps: Set<number> | undefined,
  holds: IConditionOracle,
): boolean {
  if (indexed.condId === undefined) return true;
  deps?.add(indexed.condId);
  return holds(indexed.condId);
}

// Answers whether a condition holds for the node being resolved
type IConditionOracle = (id: number) => boolean;

const GLOBAL_TRUTH: IConditionOracle = id => holdsCondition(id);

// `null` rather than `{}` for "nothing matched", so the caller can skip the empty-object churn on
// every class-prop set that has no rules.
function matchRules(
  parts: string[],
  deps?: Set<number>,
  holds: IConditionOracle = GLOBAL_TRUTH,
): IResolvedStyle | null {
  const literal = new Set(parts);
  const tokens = elementTokens(parts);
  let matched: IRuleMatch[] | null = null;

  for (const token of tokens) {
    const bucket = ruleIndex.get(token);
    if (bucket === undefined) continue;

    for (const indexed of bucket) {
      if (!indexed.rule.tokens.every(needed => tokens.has(needed))) continue;
      if (!holdsRule(indexed, deps, holds)) continue;
      matched ??= [];
      matched.push({
        indexed,
        derivedTokens: indexed.rule.tokens.filter(
          ruleToken => !literal.has(ruleToken),
        ).length,
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

// A scoped token contributes its base too, since the scope renames the token instead of adding one
// Without the base a global `.card` would stop matching once a component defines its own `.card`
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
