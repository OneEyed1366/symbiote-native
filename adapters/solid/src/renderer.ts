// A Solid custom renderer over @symbiote-native/engine, built on solid-js/universal's official
// createRenderer — the framework-agnostic seam Solid itself ships for non-DOM targets. Each
// RendererOptions method maps onto the engine's tiny mutation API; the engine owns all Fabric
// clone-on-write, so Solid drives the exact same retained tree React, Vue, Angular and Svelte do.
//
// THIS MODULE IS ALSO A COMPILER TARGET, which is why it exports what it exports. babel-preset-solid
// with `generate: 'universal'` rewrites every JSX element into direct calls imported from the
// `moduleName` it was configured with (../babel-preset.cjs points it here, at the ./renderer
// subpath). A component like
//
//   <symbiote-view style={{ flex: 1 }}>count {n()}</symbiote-view>
//
// compiles to `createElement('symbiote-view')` + `setProp(...)` + `createTextNode('count ')` +
// `insert(el, n, null)`, all imported from this file. So the named exports at the bottom are a
// hard contract with the compiler, not a matter of taste: drop one and the app fails to bundle
// with a module-not-found on an import nobody typed. The 11 names were verified by running
// babel.transformSync over representative JSX (elements, dynamic text, <Show>, <For>, spread,
// ref) rather than read off the docs.

import { createRenderer, type RendererOptions } from 'solid-js/universal';
import {
  appendChild,
  createAnchor,
  createElement as createEngineElement,
  createRawText,
  dlog,
  firstChildOf,
  insertBefore,
  isRawTextNode,
  isTextContainer,
  nextSiblingOf,
  parentOf,
  removeChild as removeEngineChild,
  routeProp,
  setNodePressed,
  setProp as setEngineProp,
  setText as setEngineText,
  textOf,
  toPublicInstance,
  SymbioteSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';

// Solid host nodes are all SymbioteNode (elements, raw text, anchors). The mount container is the
// surface, and Solid's own `render(code, node)` takes that container as a NodeType, so the surface
// has to live in the same type as everything else rather than in a separate parent type the way
// Vue's RendererOptions<HostNode, HostElement> allows.
type IHostNode = ISymbioteNode | SymbioteSurface;

function isSurface(node: IHostNode): node is SymbioteSurface {
  return node instanceof SymbioteSurface;
}

function isRawText(node: IHostNode): boolean {
  return !isSurface(node) && isRawTextNode(node);
}

// One active surface per process. This is FORCED here, not chosen: the compiled-JSX contract above
// means every mutation arrives through module-level functions with no surface argument, so there is
// nowhere for a per-surface renderer instance to be threaded through (Vue can close over its
// surface because Vue's createRenderer is called by US, per mount). Threading it per node instead
// would mean walking `parent` to the root on EVERY setProperty to find which surface to recommit —
// too hot for the prop path. Same single-root-per-process conclusion the Svelte adapter reached for
// its own reasons (svelte-adapter-dom-shim §10).
let activeSurface: SymbioteSurface | undefined;

export function setActiveSurface(surface: SymbioteSurface | undefined): void {
  activeSurface = surface;
}

// Every mutation asks the surface to (microtask-coalesced) recommit. Solid updates fine-grained and
// often — a single signal write can touch several props across several nodes — so a burst within one
// tick collapses into a single completeRoot, which is exactly what requestCommit() is for.
//
// A missing surface is not an error: Solid disposes its reactive graph asynchronously, so a
// cleanup-driven removeNode can legitimately land after unmount() cleared the surface. Dropping the
// commit is correct there (nothing to commit into), but it stays logged rather than silent.
function requestCommit(): void {
  if (activeSurface === undefined) {
    dlog('solid mutation after unmount — commit skipped');
    return;
  }
  activeSurface.requestCommit();
}

// Hoisted out of nodeOps and exported because descriptor-to-solid.ts needs the same text-update
// path for a Descriptor's string child, and createRenderer() only hands back the 11 names the JSX
// compiler imports — replaceText is not among them. Going through here rather than calling the
// engine's setText directly is what keeps the mutation paired with requestCommit().
export function replaceText(textNode: IHostNode, value: string): void {
  if (isSurface(textNode)) return;
  setEngineText(textNode, asText(value));
  requestCommit();
}

// solid-js/universal hands createTextNode/replaceText the JSX child value UNCONVERTED, not a
// stringified one: normalizeIncomingArray() pushes `createTextNode(item)` straight from the
// children array, so `<Text>{list().length} tiles</Text>` arrives here as the NUMBER 3. On the DOM
// that is invisible — document.createTextNode coerces — which is why upstream never had to, and why
// React's and Vue's adapters (whose frameworks stringify first) never saw it either. Here the value
// lands on RCTRawText's `text`, which Fabric parses as a std::string: a number fails the
// conversion, convertRawProp logs and falls back to the DEFAULT empty string, and an empty first
// fragment then ABORTS the app inside BaseTextShadowNode::buildAttributedString — a native SIGABRT
// with nothing in the JS stack to point at. Diagnosed on the iOS simulator 2026-08-19. The
// parameter is typed `string` by RendererOptions, so the guard reads as redundant; it is not, and
// `unknown` is what makes that honest rather than a cast.
function asText(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

// Hoisted and exported for the same reason as replaceText above: createRenderer() hands back only
// the 11 names the JSX compiler imports, and removeNode is not among them — but create-portal.tsx
// has to DETACH its anchor host from the portal target on cleanup. Going through here rather than
// calling the engine's removeChild directly is what keeps the mutation paired with requestCommit(),
// and keeps the surface-vs-node branch in one place.
// The REFUSED path's half of `:active`, and the reason a refusal costs the component instance
// rather than the pressed styling. A `<Pressable>` the lowering left as a component still owns its
// own press machine, and one call here puts the node into its pressed state so `.btn:active`
// applies exactly as it would on a lowered tag.
//
// Exported paired with requestCommit() for the same reason removeNode below is: the press arrives
// from a NATIVE EVENT, outside any renderer mutation, so nothing else schedules a commit. React's
// twin (`setNodeHidden` from hideInstance) needs none because its reconciler is already mid-commit
// when it calls; Solid's is not. Costs nothing when no `:active` rule is registered — the engine
// hands back the same style object and `isAlreadyPublished` turns the re-push away without dirtying
// the node.
export function setHostPressed(node: IHostNode, pressed: boolean): void {
  if (isSurface(node)) return;
  setNodePressed(node, pressed);
  requestCommit();
}

export function removeNode(parent: IHostNode, node: IHostNode): void {
  if (isSurface(node)) return;
  if (isSurface(parent)) parent.removeChild(node);
  else removeEngineChild(parent, node);
  requestCommit();
}

// RN's Text.js applies two defaults on the way to native (core/components/src/text-props.ts:
// ellipsizeMode 'tail', allowFontScaling true unless literally false). The Solid <Text> wrapper
// folds them with resolveTextProps; a template the Babel lowering rewrote to the intrinsic
// `symbiote-text` has no wrapper, so the renderer seeds them instead. Without this a
// numberOfLines={1} line clips mid-word with no ellipsis — device-observed, and silent.
// Vue's twin: adapters/vue/src/renderer/index.ts.
//
// A FOLD per key, not a default VALUE, and the difference is not cosmetic: `resolveTextProps` is
// the authority and it reads `ellipsizeMode ?? 'tail'` / `allowFontScaling !== false`, so a null
// (or 0, or '') has to resolve to the default too. Substituting only on `undefined` — which this
// did until 2026-08-23 — meant `<Text ellipsizeMode={null}>` committed null through a lowered tag
// and 'tail' through a wrapper: a divergence lowering introduced, device-only and silent. The same
// two folds are described as data in `@symbiote-native/components/host-primitives` for the
// COMPILE-time transforms; collapsing all of them onto resolveTextProps is a separate step.
type ITextFold = (value: unknown) => unknown;

const TEXT_FOLDS: ReadonlyMap<string, ITextFold> = new Map<string, ITextFold>([
  ['ellipsizeMode', value => value ?? 'tail'],
  ['allowFontScaling', value => value !== false],
]);

function seedTextDefaults(node: ISymbioteNode): void {
  for (const [key, fold] of TEXT_FOLDS)
    setEngineProp(node, key, fold(undefined));
}

// Seeding at CREATE is not enough, and the gap is device-only. A framework that clears a prop it
// set earlier hands us an explicit `undefined` at PATCH time, and the default has to come BACK
// rather than stay cleared — RN treats a missing prop and an explicit undefined alike, and only a
// literal `false` opts out of allowFontScaling. Two Map lookups on text nodes only, and none at
// all on a View, so it stays off the hot path.
function foldTextValue(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): unknown {
  if (!isTextContainer(node)) return value;
  const fold = TEXT_FOLDS.get(key);
  return fold === undefined ? value : fold(value);
}

// The alias fold, at the RENDERER and not only in the transform — the defect class Angular paid for
// twice on 2026-08-31. A lowered element inherits nothing the component wrapper did, and the
// compile-time rename in `babel-lower-host-primitives.cjs` covers exactly the call sites the
// transform REWROTE: `<View id={x} />` is fine (the attribute name is renamed before the preset
// compiles it, dynamic value included), but a hand-written `<symbiote-view id="x">` is not, and it
// committed `id` — a key Fabric does not know — while the component committed `nativeID`. Measured
// by mounting both forms and diffing committed key NAMES; totals were identical and said nothing.
//
// The transform's rename STAYS. It is not redundant: it means the markup path arrives here already
// spelled `nativeID`, so the common case never takes the branch below with a key to rewrite.
//
// One string comparison rather than a Map lookup, because this sits on the per-prop write path —
// 32 001 prop writes on a benchmark create, where a Map.get is the kind of cost the engine spent
// this month removing. That is only safe while every primitive shares ONE alias pair, which is a
// property of the shared spec and not of this file, so `renderer-alias-fold.test.ts` re-derives
// both constants from `HOST_PRIMITIVES` and fails the moment a second pair appears.
const ALIAS_FROM = 'id';
const ALIAS_TO = 'nativeID';

function foldAliasKey(name: string): string {
  return name === ALIAS_FROM ? ALIAS_TO : name;
}

const nodeOps: RendererOptions<IHostNode> = {
  createElement(tag) {
    const descriptor = descriptorFor(tag);
    // The TAG goes over as well, not just the resolved Fabric name. The host-behavior registry is
    // keyed by intrinsic tag while a node only ever carries the resolved view name — `symbiote-
    // pressable` resolves to `RCTView` — so without this the lookup asks for `RCTView` and finds
    // nothing, and the press machine silently never attaches. Registering under the Fabric name
    // instead would be worse: every plain `View` would get a press machine.
    const node = createEngineElement(
      descriptor.component,
      descriptor.isText,
      tag,
    );
    if (descriptor.isText) seedTextDefaults(node);
    // Graft the imperative public-instance API (measure / setNativeProps / focus / …) onto the raw
    // node so a `ref` to a host element exposes it exactly like React's getPublicInstance.
    // toPublicInstance mutates in place and returns the SAME node identity, so the engine's commit
    // mirror (keyed on the raw node) still resolves it. Solid hands a plain `ref={el}` this object
    // by assignment, so identity survives — but it must never be put in a createStore(), whose deep
    // proxy would become a different WeakMap key and silently break every imperative command.
    dlog(`solid createElement ${descriptor.component} -> public instance`);
    return toPublicInstance(node);
  },

  // Two callers, one signature. Real content: `createTextNode('count ')` for a text literal, which
  // is genuine RCTRawText and must live inside a <Text>. A PLACEHOLDER: solid-js/universal's
  // cleanChildren() does `replacement || createTextNode("")` to hold the position of a dynamic
  // expression (<Show>, <For>, any `{...}` with following siblings) while it has nothing to show.
  // An empty RCTRawText would actually PAINT in Fabric, so an empty string maps to an engine
  // anchor: a real retained node that keeps sibling order correct and is skipped by the commit walk.
  // Identical call and identical fix as Vue's createText (adapters/vue/src/renderer/index.ts).
  createTextNode(value) {
    const text = asText(value);
    return text === '' ? createAnchor() : createRawText(text);
  },

  replaceText,

  // Answers "is this node one I can write a string into", NOT "did createTextNode make it" — and
  // the difference is load-bearing. solid-js/universal's insertExpression() does
  // `if (node && isTextNode(node)) replaceText(node, value)` where `node` is whatever cleanChildren
  // left in place, i.e. usually the empty-string ANCHOR from createTextNode above. Answering true
  // for an anchor would send the runtime down replaceText() to write text into a node that is not
  // an RCTRawText and never reaches Fabric at all; answering false sends it down its other branch,
  // which replaces the anchor with a fresh raw-text node — the correct outcome. So this checks the
  // component name, and an anchor ('#anchor') is excluded by construction.
  isTextNode(node) {
    return isRawText(node);
  },

  setProperty(node, name, value) {
    if (isSurface(node)) return;
    // routeProp makes the prop-vs-event decision from the node's ViewConfig (onPress on a View
    // becomes a listener; onTintColor on a Switch stays a prop), and centralizes the class+style
    // merge. Shared with React and Vue — never re-implement an `onX` check here
    // (symbiote-engine-core §2).
    routeProp(node, foldAliasKey(name), foldTextValue(node, name, value));
    requestCommit();
  },

  insertNode(parent, node, anchor) {
    // The surface is only ever the root CONTAINER, never a child or a sibling marker. Both guards
    // are narrowing, not defensive: RendererOptions types every position as the same NodeType, so
    // the union has to be discharged before the engine calls, which take a node.
    if (isSurface(node)) return;
    const before =
      anchor !== undefined && !isSurface(anchor) ? anchor : undefined;

    if (isRawText(node) && (isSurface(parent) || !isTextContainer(parent))) {
      // Fabric has no bare-text host: RCTRawText is only valid as a <Text> child. Reached by a
      // dynamic expression that resolves to a string outside a <Text>, e.g.
      // `<symbiote-view>{label()}</symbiote-view>`. Failing loudly at mount beats building an
      // invalid tree that crashes deeper in native with a far less legible error.
      throw new Error(
        `Text string "${textOf(node) ?? ''}" must be rendered inside a <Text>`,
      );
    }

    if (isSurface(parent)) {
      if (before !== undefined) parent.insertBefore(node, before);
      else parent.appendChild(node);
    } else if (before !== undefined) {
      insertBefore(parent, node, before);
    } else {
      appendChild(parent, node);
    }
    requestCommit();
  },

  removeNode,

  getParentNode(node) {
    if (isSurface(node)) return undefined;
    return parentOf(node) ?? activeSurface;
  },

  // Anchors are NOT filtered out of this or getNextSibling, deliberately. solid-js/universal keeps
  // its own record of which nodes it put where and re-derives positions through these two lookups
  // (cleanChildren walks getFirstChild to empty a parent; insertExpression reaches for
  // getFirstChild(parent) to replace text in place). Hiding a node the runtime itself inserted
  // desyncs that record from the real tree. Anchors are invisible to FABRIC — the commit walk skips
  // them — not to tree traversal.
  getFirstChild(node) {
    return isSurface(node) ? node.children[0] : firstChildOf(node);
  },

  getNextSibling(node) {
    if (isSurface(node)) return undefined;
    // The surface is handed over because a TOP-LEVEL node has no parent to read a sibling list
    // from — the surface owns that list. The engine returns undefined rather than guessing.
    return nextSiblingOf(node, activeSurface);
  },
};

// The compiled-JSX contract. See the module header: these names are imported by generated code,
// so the list is fixed by babel-preset-solid, not by us.
export const {
  render,
  effect,
  memo,
  createComponent,
  createElement,
  createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
  use,
} = createRenderer<IHostNode>(nodeOps);
