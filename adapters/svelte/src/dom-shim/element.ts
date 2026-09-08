// The workhorse of the shim, and it has FIVE doors, not one — svelte decides which by tag name,
// by compiled namespace and by whether the attribute starts with `on`, so an element cannot
// choose its own:
//
//   set_custom_element_data   hyphenated tags (`text-input`, …). Stringifies a scalar; an OBJECT
//                             lands as a real property set, which is what makes `p={{…}}` work.
//   set_attribute             every other tag, and the hyphenated ones for a non-string value.
//   set_class                 -> `setAttribute('class')` in the svg namespace, `dom.className`
//                             in html. Both spellings land in the same bag key.
//   set_style                 -> `dom.style.cssText`, STRINGIFIED, plus the authored value under
//                             a private Symbol. See `style-cache.ts`.
//   addEventListener          any `on<Name>` attribute, via `$.event()`, with the `on` stripped.
//
// All five converge on one folded bag and out through `routeProp`, the entry point React's flat
// bag and Vue's patchProp already use — because only `routeProp` knows which `on*` names the
// node's ViewConfig declares as events and which are ordinary callback props a behavior reads.
// `p` is ours to name (§3g(c)); a component forwarding a whole bag emits it, app code need not.
//
// They converge, they do not merge: `p` owns its key SET, since a key dropped from the bag has to
// reset the prop, while the other four own a key each. Hence `doorBag` / `pBag` below.
//
// A per-key diff in the setter is MANDATORY (§3g(c)), not an optimization: Svelte's
// `set_custom_element_data` has no early-out guard and runs on every effect re-fire, so
// without the diff every prop gets rewritten whenever any one of them changes.

import {
  createElement,
  dlog,
  routeProp,
  toPublicInstance,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';
import { normalizeSvelteClass } from '../class-value';
import {
  CANONICAL_BY_LOWER,
  CANONICAL_PROP_NAMES,
} from './canonical-prop-names';
import { foldHostBag } from './fold-host-bag';
import { ShimNode } from './shim-node';
import { discoverStyleCacheKey } from './style-cache';

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
  // LAZY, and that is a measured decision, not a style one. A primitive carrying its whole prop
  // surface in the `p` bag never writes this on the create path — but an eager field allocated a
  // Map per element regardless, 9 002 of them on a 1 000-row create, in a window where GC is the
  // largest single bucket (29%).
  private attributes: Map<string, unknown> | undefined = undefined;
  // The four attribute doors write `doorBag`, `set p` writes `pBag`, `lastBag` is the folded merge.
  // Held in ONE object, `set p` deleted the `class` `from_tree` had written at clone time, so
  // `<view p={handlers} class="x">` committed with no style at all and nothing was red. Unreachable
  // while an element used one door, which every lowered tag and adapter component does.
  // Both LAZY: an element touching one door still allocates one object.
  private doorBag: IShimPropBag | undefined = undefined;
  private pBag: IShimPropBag | undefined = undefined;
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
  private styleSlot: { cssText: string } | undefined = undefined;

  get style(): { cssText: string } {
    return (this.styleSlot ??= { cssText: '' });
  }

  // The real `style` seam, reached from the Symbol accessor below rather than from `.style`: that
  // slot only ever sees `String(value)`. Not part of the DOM surface.
  writeStyleValue(value: unknown): void {
    this.writeBagKey('style', value);
  }

  // `set_class`'s html-namespace exit. Without the setter it lands as a plain JS property, and the
  // failure is half-silent: a static `class="card"` rides the template through `setAttribute` and
  // keeps working, so only the dynamic spelling stops styling.
  get className(): unknown {
    return this.lastBag.class;
  }

  set className(value: unknown) {
    this.writeBagKey('class', value);
  }

  // The single object-bag prop. The literal name is ours to choose (§3g(c)) — the adapter's
  // own View.svelte/Text.svelte/… emit `<view p={bag}>`; app code never sees it.
  get p(): IShimPropBag {
    return this.lastBag;
  }

  set p(bag: IShimPropBag | undefined) {
    // The fold runs HERE rather than at element creation because an alias can arrive on an update
    // (`id` bound to a signal), and it runs before the diff so `lastBag` is always the folded shape
    // — otherwise a seeded default would look like a change on every single set.
    this.pBag = bag;
    const next = this.foldedBag();
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

  // A BARE tag's props arrive here, one key at a time, and they used to stop here: an inert Map,
  // nothing routed, nothing committed, nothing red. That was survivable only while every host
  // element in an app was produced by the lowering transform, which builds the `p` bag above —
  // and it is exactly what made that transform load-bearing for CORRECTNESS on this adapter
  // alone. Routing the key makes `<view testID="x">` and `<view p={{ testID: 'x' }}>` the same
  // commit, so the transform goes back to being the optimisation it is everywhere else.
  //
  // `value` is `unknown`, not `string`: Svelte's `set_attribute` hands the raw value straight
  // through for a name with no prototype setter, so an object `style` or a number arrives
  // unstringified. The DOM would coerce it; we must not — `routeProp` wants the real value.
  //
  // The Map stays, and is not redundant: `getAttribute` must answer with the name the caller
  // wrote, while the bag has been folded (`id` -> `nativeID`) by the time it is stored.
  // `name` arrives LOWERCASED for every static attribute on every tag, and for a dynamic one on any
  // tag whose name is not also an SVG element — the compiler settles that, so the repair has to
  // happen here. One Map lookup per attribute write, no allocation; a name already canonical (or
  // one we do not know) is handed on untouched. See `canonical-prop-names.ts`.
  setAttribute(name: string, value: unknown): void {
    (this.attributes ??= new Map()).set(name, value);
    this.writeBagKey(CANONICAL_BY_LOWER.get(name) ?? name, value);
  }

  getAttribute(name: string): unknown {
    return this.attributes?.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes?.delete(name);
    // Same repair as the write, or a removal clears a key nothing ever set.
    this.writeBagKey(CANONICAL_BY_LOWER.get(name) ?? name, undefined);
  }

  // One key into the same bag `set p` writes, so the three spellings cannot drift into three
  // representations. Folded on every write because the fold is idempotent by construction
  // (`fold-host-bag.ts` states and tests that) — a bare tag has no other pass that could do it.
  //
  // Not `private`: the prototype accessors installed at the bottom of this file are the third
  // writer, and they are defined from module scope because there are ~290 of them.
  writeBagKey(name: string, value: unknown): void {
    const door: IShimPropBag = { ...this.doorBag };
    if (value === undefined) delete door[name];
    else door[name] = value;
    this.doorBag = door;

    const prev = this.lastBag;
    const next = this.foldedBag();
    this.lastBag = next;
    if (this.engineNode === undefined) return; // not live yet — onMadeLive() replays in full
    applyBagDiff(this.engineNode, prev, next);
    this.surface?.requestCommit();
  }

  // A door key WINS over the same name inside `p`: fixed precedence, so the committed value does
  // not depend on which setter svelte called last. Branched to keep a one-door element at one fold.
  private foldedBag(): IShimPropBag {
    const door = this.doorBag;
    const bag = this.pBag;
    if (door === undefined)
      return foldHostBag(this.tagName, normalizeBagClasses(bag ?? {}));
    if (bag === undefined)
      return foldHostBag(this.tagName, normalizeBagClasses(door));
    return foldHostBag(this.tagName, normalizeBagClasses({ ...bag, ...door }));
  }

  // THE FIFTH DOOR, and it converges on the same bag as the other four. Svelte turns EVERY
  // `on<Name>` attribute into `$.event()`, whatever the name means to us — so this receives both
  // `Press`, which the node's ViewConfig declares as an event, and `ValueChange`, which no config
  // declares and which `behaviors/{switch,text-input}.ts` read as `node.props.onValueChange`.
  // Calling `setEventListener` directly answered "event" for both and stashed the second under a
  // name nothing dispatches to: the toggle moved natively and the app's callback never ran.
  // Only `routeProp` knows which is which, so the handler goes back through the bag under the name
  // the author wrote.
  addEventListener(name: string, handler: (event: unknown) => void): void {
    this.writeBagKey(propNameForEvent(name), handler);
  }

  removeEventListener(name: string): void {
    this.writeBagKey(propNameForEvent(name), undefined);
  }

  override cloneNode(deep?: boolean): ShimElement {
    const clone = new ShimElement(this.tagName, this.namespaceURI);
    if (this.attributes !== undefined)
      clone.attributes = new Map(this.attributes);
    // The bag, not just the Map — `from_tree` builds each template ONCE, writes its static
    // attributes onto that master, and then clones per instance, so without this every attribute
    // an app spells statically (`<view testID="x" class="card">`) is dropped from every instance.
    // A reference copy is safe because `writeBagKey` and `set p` both publish a fresh object.
    // `doorBag` too, or a `set p` on the CLONE re-folds without the master's static attributes.
    clone.doorBag = this.doorBag;
    clone.pBag = this.pBag;
    clone.lastBag = this.lastBag;
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
    // exists: `descriptor.component` is the Fabric view name (`view` -> `RCTView`), so a
    // host-behavior registry keyed by tag can only be reached from here. The argument defaults to
    // `component`, so passing it changes nothing until a behavior is registered.
    return toPublicInstance(
      createElement(descriptor.component, descriptor.isText, this.tagName),
    );
  }

  // One replay, because a handler is an ordinary bag key now — it arrives before the node is live
  // exactly like `class` or `style` does, and leaves through the same diff.
  override onMadeLive(): void {
    const engineNode = this.engineNode;
    if (engineNode === undefined) return;
    applyBagDiff(engineNode, EMPTY_BAG, this.lastBag);
  }
}

// Svelte hands `addEventListener` the authored name minus its `on`, so `onPress` arrives as
// `Press`. Putting it back is what lets the handler re-enter through the ordinary prop bag, where
// `routeProp` decides event-vs-prop from the node's ViewConfig — the one decision this layer
// cannot make. A name that was already lowercase (`onclick` -> `click`) rebuilds as `onclick`,
// which no config declares and which therefore lands inertly in `node.props`, exactly as a DOM
// event name should on a native host.
//
// A charCode test rather than `name[0] !== name[0].toUpperCase()`: this runs per handler per
// element on the create path, and the comparison spelling allocates two strings to answer it.
function propNameForEvent(name: string): string {
  const first = name.charCodeAt(0);
  if (first >= 65 /* A */ && first <= 90 /* Z */) return `on${name}`;
  return `on${name[0].toUpperCase()}${name.slice(1)}`;
}

// The seam `set_style` writes the authored value to. Discovered once, at module load, because
// svelte's key is a module-private Symbol — see `style-cache.ts` for the whole mechanism.
Object.defineProperty(ShimElement.prototype, discoverStyleCacheKey(), {
  get(this: ShimElement): unknown {
    return this.p.style;
  },
  set(this: ShimElement, value: unknown): void {
    this.writeStyleValue(value);
  },
});

// The setters `get_setters` has to find, so `set_custom_element_data` stops guessing. Its
// heuristic branch — reached whenever no real setter exists for the name — hands a scalar on as
// `String(value)` and assigns an object to a plain JS property the shim never reads, so a
// hyphenated tag committed `"false"` for `multiline={false}` and nothing at all for an object.
// With a setter present the raw value lands in the same folded bag `set p` and `setAttribute`
// write, and the three doors agree.
//
// ONE-TIME, at module load: ~290 defineProperty calls, nothing per node
// (`svelte-shim-is-the-per-node-create-path.md`). The instance shape does not move — these live on
// the prototype — so no element pays for them.
//
// A name the shim ALREADY owns is skipped rather than overwritten, and it is owned in TWO places
// that need two different tests. On the PROTOTYPE: `style` is a `{cssText}` slot `set_style`
// writes through, `className` is `set_class`'s html exit, `p` is the bag itself — an `in` test
// covers those, and covers a future member of the chain the day it is added.
//
// On the INSTANCE is the one that cost a device crash. `children` is a canonical prop name AND
// ShimNode's own field — the tree itself — and `in` cannot see it, because a class field lives on
// the instance and the prototype is empty at module load. Installing an accessor over it is
// harmless under vitest, where `useDefineForClassFields` makes `this.children = []` a
// `defineProperty` that shadows the accessor, and FATAL under Metro, whose loose class fields
// compile it to an assignment that the prototype setter swallows — so `this.children` read back
// `this.p.children`, i.e. undefined, and `makeLive` died iterating it on the app's ROOT node.
// Every one of the 328 headless tests passed.
//
// The probe is a real instance built before the loop, so it answers with whatever fields the
// ACTIVE transform materialises rather than a list someone has to keep. Its fields carry explicit
// `= undefined` initializers for the same reason: a bare declaration emits nothing under Metro and
// the probe would not see it.
const SHAPE_PROBE = new ShimElement('view');

for (const name of CANONICAL_PROP_NAMES) {
  if (name in ShimElement.prototype) continue;
  if (Object.hasOwn(SHAPE_PROBE, name)) continue;
  Object.defineProperty(ShimElement.prototype, name, {
    get(this: ShimElement): unknown {
      return this.p[name];
    },
    set(this: ShimElement, value: unknown): void {
      this.writeBagKey(name, value);
    },
  });
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
