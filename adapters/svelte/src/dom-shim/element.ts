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
  setNodeOwner,
  toPublicInstance,
  type ISymbioteNode,
  type ISymbioteNodeOwner,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';
import { normalizeSvelteClass } from '../class-value';
import { foldHostBag } from './fold-host-bag';
import { ELEMENT_NODE, ShimNode } from './shim-node';

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
// An empty layer that exists to be what `globalThis.Element` points at, and it is load-bearing.
// Svelte's `get_setters` (internal/client/dom/elements/attributes.js) walks from the ELEMENT
// INSTANCE up and STOPS when it reaches `Element.prototype`. While `Element` was `ShimElement`
// itself, the first prototype step was already the stop, so the walk collected nothing and `p` —
// which lives on `ShimElement.prototype`, one step past it — was invisible. `set_attributes` then
// fell through to `setAttribute`, which writes an inert Map, and every prop vanished with nothing
// red. The rule is therefore that `Element` must be a proper ANCESTOR of the class owning the
// setters, never that class: `.claude/rules/svelte-shim-element-global-must-be-an-ancestor.md`.
export abstract class ShimElementBase extends ShimNode {}

export class ShimElement extends ShimElementBase {
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

  // `set_style` writes `dom.style.cssText`, so a shim with no `.style` THROWS rather than
  // no-opping — a `style` attribute on a bare tag crashed the mount. LAZY, for the reason
  // `.claude/rules/svelte-shim-is-the-per-node-create-path.md` records about the two Maps below it:
  // an eager field is one object per element, ~9 000 per create, in the window where GC is the
  // largest bucket. Only `set_style` touches this, and no lowered element takes that path.
  private styleSlot: { cssText: string } | undefined;

  get style(): { cssText: string } {
    return (this.styleSlot ??= { cssText: '' });
  }

  override get nodeType(): number {
    return ELEMENT_NODE;
  }

  // The single object-bag prop. The literal name is ours to choose (§3g(c)) — the adapter's
  // own View.svelte/Text.svelte/… emit `<symbiote-view p={bag}>`; app code never sees it.
  get p(): IShimPropBag {
    return this.lastBag;
  }

  set p(bag: IShimPropBag | undefined) {
    // The fold runs HERE rather than at element creation because an alias can arrive on an update
    // (`id` bound to a signal), and it runs before the diff so `lastBag` is always the folded shape
    // — otherwise a seeded default would look like a change on every single set.
    const next = foldHostBag(this.tagName, normalizeBagClasses(bag ?? {}));
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
    const node = toPublicInstance(
      createElement(descriptor.component, descriptor.isText, this.tagName),
    );
    const owner = resolveOwnerFromSvelteMeta(this);
    if (owner !== undefined) setNodeOwner(node, owner);
    return node;
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

// The devtools panel's owner tag (ISymbioteNodeOwner — symbiote-devtools-inspector skill) reads
// `__svelte_meta`, a property Svelte's OWN compiled output stamps onto every element it creates
// (via the publicly re-exported `$.add_locations`, only emitted when the compiler runs with
// `dev: true` — see metro-svelte-transformer.cjs). Nothing here writes `__svelte_meta`; it is
// pure Svelte-runtime behavior this shim happens to receive because from_tree()'s DOM traversal
// (nodeType/firstChild/nextSibling) already has to work for compiled output to run at all.
//
// `__svelte_meta.loc.file` only names the file whose OWN markup literally created this element —
// for `<CanaryScreen><View><Text/></View></CanaryScreen>`, the Text's native node's `loc.file` is
// View.svelte (View's own template creates the intrinsic tag), never CanaryScreen.svelte, because
// CanaryScreen never calls `document.createElement` itself — it only invokes the `View`
// component, whose OWN template does. Read that way, a composing-only app component (anything
// that renders exclusively through other components, which is virtually every real screen) is
// NEVER `chain[chain.length - 1]` for any node and so never shows up in the panel at all —
// confirmed against a real build (symbiote-devtools-inspector skill).
//
// `__svelte_meta.parent` is the fix: it is Svelte's own `dev_stack`, a linked list Svelte pushes
// one entry onto every time a `<Component/>` tag is INVOKED (`add_svelte_meta(callback, 'component',
// callerComponent, line, column, {componentTag})` — verified against real compiler output,
// compiling nested `Outer.svelte` -> `<Wrapper/>` -> `Wrapper.svelte`). Each entry's `.file` is the
// CALLING component's file — so walking `loc.file`, then `parent.file`, `parent.parent.file`, ...
// and reversing yields the full root-first ancestry: [App.svelte, CanaryScreen.svelte,
// View.svelte] for the Text example above. Non-component dev_stack entries (`{#each}`/`{#if}`
// blocks etc., pushed by the SAME `add_svelte_meta`) carry the enclosing component's own file too
// — harmless duplication, collapsed by dedupeConsecutive below (NOT here — see that function's
// comment for why dedup must run AFTER the library filter, not before).
function svelteMetaFileChain(meta: unknown): string[] {
  const files: string[] = [];
  if (typeof meta !== 'object' || meta === null) return files;
  const loc: unknown = Reflect.get(meta, 'loc');
  if (typeof loc === 'object' && loc !== null) {
    const file = Reflect.get(loc, 'file');
    if (typeof file === 'string' && file !== '') files.push(file);
  }
  let cursor: unknown = Reflect.get(meta, 'parent');
  while (typeof cursor === 'object' && cursor !== null) {
    const file = Reflect.get(cursor, 'file');
    if (typeof file === 'string' && file !== '') files.push(file);
    cursor = Reflect.get(cursor, 'parent');
  }
  files.reverse();
  return files;
}

// Collapses ADJACENT duplicate files — safe only once nothing that could sit BETWEEN two same-file
// entries is still in the list. A library-internal navigator wrapper (Stack.Navigator's own
// Screen component, etc.) routinely sits between two invocations of the SAME app screen — e.g.
// `[App, MenuScreen, <library Screen wrapper>, MenuScreen, <library>, MenuScreen, ...]` for a
// nested-navigators demo that reuses one screen component at every nesting level. Deduping BEFORE
// the library filter (the original, buggy order) never sees these as adjacent, so filtering the
// library entries out afterward leaves the app-level duplicates uncollapsed — confirmed on a real
// device: `App > MenuScreen > MenuScreen > MenuScreen > ...` repeating many times over, which then
// made the panel pathologically slow to build/render (not a stack overflow — a working algorithm
// building a genuinely huge but semantically MEANINGLESS tree). Calling this AFTER the filter is
// what actually collapses it back down to `App > MenuScreen`.
function dedupeConsecutive(files: readonly string[]): string[] {
  return files.filter((file, index) => file !== files[index - 1]);
}

// Library-internal components (@symbiote-native/*'s own View/Text/ScrollView/... wrappers) create
// a dev_stack entry exactly like any app component, so they'd otherwise show up as a boundary in
// the panel on equal footing with what the developer actually wrote — see the
// symbiote-devtools-inspector skill for why that reads as native-tree-level noise on a real
// device. `node_modules` is the only signal the panel can use to tell "library" from "app" apart
// without a registry of every current and future @symbiote-native package name.
function isLibraryFile(file: string): boolean {
  return file.includes('node_modules');
}

function svelteFilenameToComponent(file: string): string {
  const basename = file.split('/').pop() ?? file;
  return basename.replace(/\.svelte$/, '');
}

function resolveOwnerFromSvelteMeta(
  element: ShimElement,
): ISymbioteNodeOwner | undefined {
  const meta: unknown = Reflect.get(element, '__svelte_meta');
  const filteredFiles = svelteMetaFileChain(meta).filter(
    file => !isLibraryFile(file),
  );
  const chain = dedupeConsecutive(filteredFiles).map(file => ({
    component: svelteFilenameToComponent(file),
    file,
  }));
  return chain.length > 0 ? { chain } : undefined;
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
