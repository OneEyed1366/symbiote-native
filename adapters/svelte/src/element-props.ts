// The props of one intrinsic tag, every prop folded into one bag kept beside the engine node
// The bag leaves through `routeProp`, which alone tells a ViewConfig event from a callback prop
// `setHostAttribute` and the events own one key each, `p` owns a whole key set

import { routeProp, type ISymbioteNode } from '@symbiote-native/engine';
import { commitLiveSurfaces } from './active-surface';
import { BOOLEAN_PROP_NAMES, CANONICAL_BY_LOWER } from './canonical-prop-names';
import { normalizeSvelteClass } from './class-value';

export type IHostPropBag = Record<string, unknown>;

// The identity lets `applyBagDiff` skip its second pass on a first write
const EMPTY_BAG: IHostPropBag = Object.freeze({});

type IPropState = {
  // Lazy, as a primitive carrying its props in `p` never writes these on the create path
  attributes: Map<string, unknown> | undefined;
  doorBag: IHostPropBag | undefined;
  pBag: IHostPropBag | undefined;
  lastBag: IHostPropBag;
};

const states = new WeakMap<ISymbioteNode, IPropState>();

function stateOf(node: ISymbioteNode): IPropState {
  let state = states.get(node);
  if (state === undefined) {
    state = {
      attributes: undefined,
      doorBag: undefined,
      pBag: undefined,
      lastBag: EMPTY_BAG,
    };
    states.set(node, state);
  }
  return state;
}

// The bag last pushed to the engine, a copy of what the node holds
export function hostPropBagOf(node: ISymbioteNode): IHostPropBag {
  return states.get(node)?.lastBag ?? EMPTY_BAG;
}

export function setHostPropBag(
  node: ISymbioteNode,
  bag: IHostPropBag | undefined,
): void {
  const state = stateOf(node);
  state.pBag = bag;
  // Folded here, as an alias such as `id` can arrive on an update
  const next = foldedBag(state);
  const prev = state.lastBag;
  state.lastBag = next;
  applyBagDiff(node, prev, next);
  commitLiveSurfaces();
}

// The compiler lowercases a static name, so `CANONICAL_BY_LOWER` restores the authored one
// `getHostAttribute` answers with the written name, while the bag stores the folded one
export function setHostAttribute(
  node: ISymbioteNode,
  name: string,
  value: unknown,
): void {
  const state = stateOf(node);
  (state.attributes ??= new Map()).set(name, value);
  const canonical = CANONICAL_BY_LOWER.get(name) ?? name;
  // `<view accessible>` arrives as "", the HTML shorthand for true on a boolean prop
  writeBagKey(
    node,
    canonical,
    value === '' && BOOLEAN_PROP_NAMES.has(canonical) ? true : value,
  );
}

export function getHostAttribute(node: ISymbioteNode, name: string): unknown {
  return states.get(node)?.attributes?.get(name) ?? null;
}

export function removeHostAttribute(node: ISymbioteNode, name: string): void {
  states.get(node)?.attributes?.delete(name);
  writeBagKey(node, CANONICAL_BY_LOWER.get(name) ?? name, undefined);
}

// The authored `style`, which svelte caches on the node and never passes to `setAttribute`
export function writeHostStyle(node: ISymbioteNode, value: unknown): void {
  writeBagKey(node, 'style', value);
}

// Svelte hands over every `on<Name>` attribute minus its `on`
// The handler goes back through the bag, as only `routeProp` can tell an event from a prop
export function addHostListener(
  node: ISymbioteNode,
  name: string,
  handler: (event: unknown) => void,
): void {
  writeBagKey(node, propNameForEvent(name), handler);
}

export function removeHostListener(node: ISymbioteNode, name: string): void {
  writeBagKey(node, propNameForEvent(name), undefined);
}

function writeBagKey(node: ISymbioteNode, name: string, value: unknown): void {
  const state = stateOf(node);
  // `doorBag` is mutated in place once it exists, and then `lastBag` may be that same object
  const hasDoorBag = state.doorBag !== undefined;
  const door: IHostPropBag = state.doorBag ?? {};
  const prevValue = door[name];
  if (value === undefined) delete door[name];
  else door[name] = value;
  state.doorBag = door;

  const prev = state.lastBag;
  const next = foldedBag(state);
  state.lastBag = next;

  // Without a `p` bag `next` is `door` itself, so `prev` already holds the write
  // The one key just written is the whole diff then, and the full diff would find none
  if (hasDoorBag && state.pBag === undefined) {
    const nextValue = next[name];
    if (prevValue !== nextValue) routeProp(node, name, nextValue);
  } else {
    applyBagDiff(node, prev, next);
  }
  commitLiveSurfaces();
}

// A door key wins over the same name inside `p`, so the result does not depend on call order
function foldedBag(state: IPropState): IHostPropBag {
  const door = state.doorBag;
  const bag = state.pBag;
  if (door === undefined) return normalizeBagClasses(bag ?? {});
  if (bag === undefined) return normalizeBagClasses(door);
  return normalizeBagClasses({ ...bag, ...door });
}

// `onPress` arrives as `Press`, so the prefix goes back on
// A lowercase `click` becomes `onClick`, which no ViewConfig declares and which lands in `props`
// A char code test, as this runs per handler per element and the string compare allocates twice
function propNameForEvent(name: string): string {
  const first = name.charCodeAt(0);
  if (first >= 65 /* A */ && first <= 90 /* Z */) return `on${name}`;
  return `on${name[0].toUpperCase()}${name.slice(1)}`;
}

// Both spellings reach the engine's shared class and style merge
type IClassBagKey = 'class' | 'className';
const CLASS_BAG_KEYS: readonly IClassBagKey[] = ['class', 'className'];

// Normalized before the bag is stored, so the diff compares strings, not fresh object literals
// An unchanged `class={{ active: isOn }}` then stops dirtying the node
function normalizeBagClasses(bag: IHostPropBag): IHostPropBag {
  let next = bag;
  for (const key of CLASS_BAG_KEYS) {
    if (!(key in next)) continue;
    const normalized = normalizeSvelteClass(next[key]);
    if (normalized === next[key]) continue;
    if (next === bag) next = { ...bag };
    next[key] = normalized;
  }
  return next;
}

// Changed or added keys from `next`, then dropped keys from `prev` as `undefined`
function applyBagDiff(
  node: ISymbioteNode,
  prev: IHostPropBag,
  next: IHostPropBag,
): void {
  for (const key of Object.keys(next)) {
    if (prev[key] !== next[key]) routeProp(node, key, next[key]);
  }
  if (prev === EMPTY_BAG) return;
  for (const key of Object.keys(prev)) {
    if (!(key in next)) routeProp(node, key, undefined);
  }
}
