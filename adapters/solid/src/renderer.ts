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
  propOf,
} from '@symbiote-native/engine';
import {
  descriptorFor,
  TEXT_INPUT_MULTILINE_TAG,
} from '@symbiote-native/components';

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

// solid-js/universal hands createTextNode/replaceText the JSX child value UNCONVERTED —
// `<Text>{list().length} tiles</Text>` arrives here as the NUMBER 3. RCTRawText's `text` parses
// as a std::string: a number falls back to empty, aborting inside buildAttributedString.

// Typed `unknown` rather than `string` (which RendererOptions declares) so the runtime guard
// below isn't erased as dead code.
function asText(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

// Hoisted and exported for the same reason as replaceText above: createRenderer() hands back only
// the 11 names the JSX compiler imports, and removeNode is not among them — but create-portal.tsx
// has to DETACH its anchor host from the portal target on cleanup. Going through here rather than
// calling the engine's removeChild directly is what keeps the mutation paired with requestCommit(),
// and keeps the surface-vs-node branch in one place.
// The `:active` half: one call here puts the node into its pressed state so `.btn:active` applies.
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

// RN's two Text defaults are answered below the adapter now: the rule reads the AUTHORED bag at
// payload time (`foldTextDefaults`, `SymbioteFabricProps.cpp`), where a null, an explicit
// `undefined` and an absent prop are all "not a value the author chose" — one rule, every adapter.

// The `id` -> `nativeID` fold lives in `routeProp` now, so all five adapters resolve the
// precedence identically instead of each doing it their own way.

// `multiline` selects between TWO Fabric views, so the TAG decides and no prop write moves a node
// between them. An author writing `<text-input multiline>` instead of `<text-input-multiline>` gets
// the single-line view with a prop no ViewConfig on it declares — two silent divergences.
//
// The shared behavior (`core/components/src/behaviors/text-input.ts`) already makes the PAYLOAD
// follow the tag. The complaint has to live here instead of there: `foldPayload` runs inside the
// commit, so a throw from it lands a tick later as an uncaught exception with no frame naming the
// call site — measured, a test awaiting the mount sees `nothing committed` rather than the error.
const MULTILINE_PROP = 'multiline';

function assertMultilineMatchesTag(node: ISymbioteNode, value: unknown): void {
  if ((value === true) === (propOf(node, MULTILINE_PROP) === true)) return;
  throw new Error(
    `multiline={${String(value)}} contradicts the tag: <text-input> and ` +
      `<text-input-multiline> are different Fabric views and no prop write moves a node ` +
      `between them. Pick the tag (a runtime choice needs a <Show> around both).`,
  );
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
    // Only the multiline tag is seeded: writing `multiline: false` on the single-line one would add
    // a key the wrapper's payload does not carry, i.e. a divergence in the other direction.
    if (tag === TEXT_INPUT_MULTILINE_TAG)
      setEngineProp(node, MULTILINE_PROP, true);
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
    if (name === MULTILINE_PROP) assertMultilineMatchesTag(node, value);
    // routeProp makes the prop-vs-event decision from the node's ViewConfig (onPress on a View
    // becomes a listener; onTintColor on a Switch stays a prop), and centralizes the class+style
    // merge and the `id` -> `nativeID` rename. Shared with React and Vue — never re-implement an
    // `onX` check here (symbiote-engine-core §2).
    routeProp(node, name, value);
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

  // Reverse of `getFirstChild`'s `childHost` redirect: a child under a composed primitive's slot
  // has `node.parent` pointing at the SLOT, but `cleanChildren`'s `isParent = getParentNode(el)
  // === parent` compares against the OWNER — the same reference the JSX-level `insert()` call was
  // given. Left un-redirected, that comparison is false for every child of a bare `<scroll-view>`
  // (or any other slotted primitive) with a following sibling, so `isParent` never fires,
  // `removeNode` is never called on a full array clear, and the old children are orphaned: still
  // committed to Fabric, still retained, and re-diffed against on the next reconciliation —
  // reproduced as unbounded RAM growth and an increasingly slow "Clear" on the benchmark screen.
  // One level up only: `childHost` is always a DIRECT child the owner built (see `buildStructure`),
  // never a deeper descendant.
  getParentNode(node) {
    if (isSurface(node)) return undefined;
    const parent = parentOf(node) ?? activeSurface;
    if (parent === undefined || isSurface(parent)) return parent;
    const grandparent = parentOf(parent);
    if (grandparent !== undefined && grandparent.childHost === parent) {
      return grandparent;
    }
    return parent;
  },

  // Anchors are NOT filtered out of this or getNextSibling, deliberately. solid-js/universal keeps
  // its own record of which nodes it put where and re-derives positions through these two lookups
  // (cleanChildren walks getFirstChild to empty a parent; insertExpression reaches for
  // getFirstChild(parent) to replace text in place). Hiding a node the runtime itself inserted
  // desyncs that record from the real tree. Anchors are invisible to FABRIC — the commit walk skips
  // them — not to tree traversal.
  //
  // `childHost` redirected, same as the engine's own `appendChild`/`insertBefore`/`removeChild`
  // (`hostFor`, core/engine/src/node.ts): a composed primitive's real children live on the slot it
  // built, not on the owner it was asked to insert into, and `insert()`'s reconciliation reads this
  // to know what is ALREADY there before deciding what to insert/move/remove. Reading the owner's
  // own (single-child) array here would have every dynamic child on a bare `<scroll-view>` diffed
  // against the wrong node — invisible on VirtualizedList, which never calls `insert()` on the
  // owner directly, and wrong for any app writing `<scroll-view>{dynamicChildren}</scroll-view>`.
  getFirstChild(node) {
    if (isSurface(node)) return node.children[0];
    return firstChildOf(node.childHost ?? node);
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
