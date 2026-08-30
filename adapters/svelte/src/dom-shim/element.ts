// The workhorse of the shim. Every Symbiote intrinsic (`symbiote-view`, `symbiote-text`, …)
// is a hyphenated tag, so Svelte compiles it down the CUSTOM-ELEMENT codegen path (§3g):
// attributes go through `set_custom_element_data`, which stringifies scalars and hard-excludes
// `style`. The resolution (§3g(c)) is a single object-bag PROPERTY, not a spread of
// attributes — an object always satisfies `value && typeof value === 'object'`, so it lands as
// a real property SET (`node.p = bag`), untouched by stringification. `p`'s setter (below)
// unpacks the bag into `routeProp`, the same entry point React's flat bag and Vue's patchProp
// already use.
//
// A per-key diff in the setter is MANDATORY (§3g(c)), not an optimization: Svelte's
// `set_custom_element_data` has no early-out guard and runs on every effect re-fire, so
// without the diff every prop gets rewritten whenever any one of them changes.

import {
  createElement,
  dlog,
  routeProp,
  setEventListener,
  toPublicInstance,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';
import { normalizeSvelteClass } from '../class-value';
import { ShimNode } from './shim-node';

export type IShimPropBag = Record<string, unknown>;

// The bag a not-yet-live element is diffed against in onMadeLive. A module constant rather than a
// fresh `{}` per node: it is only ever read, and the identity lets applyBagDiff skip its second
// pass outright on the create path.
const EMPTY_BAG: IShimPropBag = Object.freeze({});

// Diagnostic-only: a process-wide sequence so every `set p` call across every shim element in a
// log dump is individually orderable against AnimatedProps reconcile#N / AnimatedView reduced#N
// / hostShim identity-change#N, to see which one is driving which.
let globalSetPSeq = 0;

// `on<Name>` handlers ride inside the prop bag (idiomatic Svelte 5 callback props — see the
// skill's §3g(c) "most of §5 collapses" note) — they are not addEventListener-style DOM
// listeners, so they are diffed and routed exactly like any other bag key, through routeProp.
export class ShimElement extends ShimNode {
  readonly tagName: string;
  readonly namespaceURI: string | undefined;
  // Both LAZY, and that is a measured decision, not a style one. A lowered primitive carries its
  // whole prop surface in the `p` bag, so neither map is ever written on the create path — but an
  // eager field allocated two Maps per element regardless, 18 004 of them on a 1 000-row create,
  // in a window where GC is the largest single bucket (29%).
  private attributes: Map<string, string> | undefined;
  private domListeners: Map<string, (event: unknown) => void> | undefined;
  private lastBag: IShimPropBag = EMPTY_BAG;

  constructor(tagName: string, namespaceURI?: string) {
    super();
    this.tagName = tagName;
    this.namespaceURI = namespaceURI;
  }

  override get nodeName(): string {
    return this.tagName;
  }

  // The single object-bag prop. The literal name is ours to choose (§3g(c)) — the adapter's
  // own View.svelte/Text.svelte/… emit `<symbiote-view p={bag}>`; app code never sees it.
  get p(): IShimPropBag {
    return this.lastBag;
  }

  set p(bag: IShimPropBag | undefined) {
    const next = normalizeBagClasses(bag ?? {});
    const prev = this.lastBag;
    this.lastBag = next;
    // THUNK, not a string (see debug.ts's header): this setter runs once per element per create
    // and the changed-key list is diagnostic only. Built eagerly it cost a Set, two key arrays, a
    // join and a template literal on every one of 9 002 elements, with logging off.
    dlog(
      () =>
        `ShimElement set-p#${++globalSetPSeq} tag=${this.tagName} live=${this.engineNode !== undefined} ` +
        `changedKeys=${diffKeys(prev, next).join(',')}`,
    );
    if (this.engineNode === undefined) return; // not live yet — onMadeLive() replays `next` in full
    applyBagDiff(this.engineNode, prev, next);
    this.surface?.requestCommit();
  }

  setAttribute(name: string, value: string): void {
    (this.attributes ??= new Map()).set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes?.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes?.delete(name);
  }

  addEventListener(name: string, handler: (event: unknown) => void): void {
    (this.domListeners ??= new Map()).set(name, handler);
    if (this.engineNode !== undefined)
      setEventListener(this.engineNode, name, handler);
  }

  removeEventListener(name: string): void {
    this.domListeners?.delete(name);
    if (this.engineNode !== undefined)
      setEventListener(this.engineNode, name, undefined);
  }

  override cloneNode(deep?: boolean): ShimElement {
    const clone = new ShimElement(this.tagName, this.namespaceURI);
    if (this.attributes !== undefined)
      clone.attributes = new Map(this.attributes);
    if (deep === true) {
      for (const child of this.children)
        clone.appendChild(child.cloneNode(true));
    }
    return clone;
  }

  // measure/measureInWindow/measureLayout/setNativeProps/focus/blur — the imperative API a
  // `bind:this` host ref hands back — ride on the engine node's prototype, so toPublicInstance is
  // the identity and this reads the same as Vue's renderer (renderer/index.ts) and React's
  // getPublicInstance.
  createEngineNode(): ISymbioteNode {
    const descriptor = descriptorFor(this.tagName);
    // The INTRINSIC TAG as the third argument, and this is the only place the tag alphabet still
    // exists: `descriptor.component` is the Fabric view name (`symbiote-view` -> `RCTView`), so a
    // host-behavior registry keyed by tag can only be reached from here. The argument defaults to
    // `component`, so passing it changes nothing until a behavior is registered.
    return toPublicInstance(
      createElement(descriptor.component, descriptor.isText, this.tagName),
    );
  }

  override onMadeLive(): void {
    const engineNode = this.engineNode;
    if (engineNode === undefined) return;
    applyBagDiff(engineNode, EMPTY_BAG, this.lastBag);
    if (this.domListeners === undefined) return;
    for (const [name, handler] of this.domListeners)
      setEventListener(engineNode, name, handler);
  }
}

// Both spellings route through the engine's shared class+style merge (routeProp's
// CLASS_PROP_KEYS), so both get the same clsx normalization here.
const CLASS_BAG_KEYS = ['class', 'className'] as const;

// Normalizing BEFORE the bag is stored — rather than at the routeProp call — is deliberate: the
// diff below then compares two class STRINGS instead of two freshly-allocated object literals, so
// a component re-rendering with an unchanged `class={{ active: isOn }}` stops marking the node
// dirty and stops driving a Fabric subtree clone that changes nothing.
function normalizeBagClasses(bag: IShimPropBag): IShimPropBag {
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

// Diagnostic only — the one caller is the `dlog` thunk above. The allocation-free twin below is
// what the hot path uses; keep them in step.
function diffKeys(prev: IShimPropBag, next: IShimPropBag): string[] {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  return [...keys].filter(key => prev[key] !== next[key]);
}

// Deliberately NOT `for (const key of diffKeys(...))`: that materialized a Set, two key arrays,
// a spread and a filtered array per element. Two direct passes route exactly the same keys —
// changed-or-added from `next`, then dropped keys from `prev` as `undefined`, which is what
// `next[key]` evaluated to in the old shape.
function applyBagDiff(
  engineNode: ISymbioteNode,
  prev: IShimPropBag,
  next: IShimPropBag,
): void {
  for (const key of Object.keys(next)) {
    if (prev[key] !== next[key]) routeProp(engineNode, key, next[key]);
  }
  if (prev === EMPTY_BAG) return;
  for (const key of Object.keys(prev)) {
    if (!(key in next)) routeProp(engineNode, key, undefined);
  }
}
