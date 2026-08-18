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
  isDebug,
  routeProp,
  setEventListener,
  toPublicInstance,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';
import { normalizeSvelteClass } from '../class-value';
import { ShimNode } from './shim-node';

export type IShimPropBag = Record<string, unknown>;

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
  private readonly attributes = new Map<string, string>();
  private readonly domListeners = new Map<string, (event: unknown) => void>();
  private lastBag: IShimPropBag = {};

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
    const changedKeys = diffKeys(prev, next);
    dlog(
      `ShimElement set-p#${++globalSetPSeq} tag=${this.tagName} live=${this.engineNode !== undefined} ` +
        `changedKeys=${changedKeys.join(',')}`,
    );
    if (this.engineNode === undefined) return; // not live yet — onMadeLive() replays `next` in full
    applyBagDiff(this.engineNode, prev, next);
    this.surface?.requestCommit();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(name: string, handler: (event: unknown) => void): void {
    this.domListeners.set(name, handler);
    if (this.engineNode !== undefined)
      setEventListener(this.engineNode, name, handler);
  }

  removeEventListener(name: string): void {
    this.domListeners.delete(name);
    if (this.engineNode !== undefined)
      setEventListener(this.engineNode, name, undefined);
  }

  override cloneNode(deep?: boolean): ShimElement {
    const clone = new ShimElement(this.tagName, this.namespaceURI);
    for (const [key, value] of this.attributes)
      clone.attributes.set(key, value);
    if (deep === true) {
      for (const child of this.children)
        clone.appendChild(child.cloneNode(true));
    }
    return clone;
  }

  // toPublicInstance grafts measure/measureInWindow/measureLayout/setNativeProps/focus/blur
  // onto the node — the imperative API a `bind:this` host ref hands back, the same augmentation
  // Vue's renderer applies at its own commit point (renderer/index.ts) and React gets from
  // getPublicInstance. Mutates in place and returns the SAME node, so this is a safe drop-in for
  // the previously-bare createElement() call.
  createEngineNode(): ISymbioteNode {
    const descriptor = descriptorFor(this.tagName);
    return toPublicInstance(
      createElement(descriptor.component, descriptor.isText),
    );
  }

  override onMadeLive(): void {
    const engineNode = this.engineNode;
    if (engineNode === undefined) return;
    applyBagDiff(engineNode, {}, this.lastBag);
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

function diffKeys(prev: IShimPropBag, next: IShimPropBag): string[] {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  return [...keys].filter(key => prev[key] !== next[key]);
}

function applyBagDiff(
  engineNode: ISymbioteNode,
  prev: IShimPropBag,
  next: IShimPropBag,
): void {
  for (const key of diffKeys(prev, next)) routeProp(engineNode, key, next[key]);
}
