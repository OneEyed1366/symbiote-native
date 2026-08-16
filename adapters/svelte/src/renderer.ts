// The adapter's core seam: Svelte's OFFICIAL custom-renderer API (`svelte/renderer`,
// sveltejs/svelte#18042) implemented directly over @symbiote-native/engine's mutation API.
// Replaces the retired DOM-shim (svelte-adapter-dom-shim skill, superseded) — Svelte now calls
// `mount(Component, { target, renderer })` and dispatches every node operation to this object
// instead of us patching globalThis DOM classes. Full design: svelte-adapter-custom-renderer
// skill.
//
// The renderer is a MODULE-LEVEL SINGLETON, not a per-mount factory — measured directly against
// the installed compiler (2026-08-16): passing `experimental.customRenderer` as a string module
// specifier makes the COMPILED COMPONENT ITSELF `import $renderer from '<that specifier>'` and
// call `$.push_renderer($renderer)` at its own top (compiling a probe component and reading the
// generated `svelte/internal/client` output confirmed this — it is not merely a type-inference
// tag, as the official test suite's per-test renderer_path might suggest). Every component we
// compile therefore always uses THIS module's default export, regardless of what `render.ts`'s
// `mount()` call passes as `{ renderer }` — a per-mount factory closure would silently never run.
// So `requestCommit` instead reads a module-level "active surface" set by `render.ts`, the same
// single-root-per-process shape the retired shim's `patchGlobals()` used (svelte-adapter-custom-
// renderer skill) — just one variable instead of nine patched globals.
//
// Individual node/mutation functions are exported alongside the renderer object: compiled `.svelte`
// markup goes through the compiler -> operations.js -> Renderer dispatch, but a JS-only
// imperative tree builder (descriptor-to-svelte.ts) calls `routeProp` directly instead — it
// never goes through template compilation, so it is not subject to the on-prefix-is-always-an-
// event compiler rule below and can route props correctly at runtime (real ViewConfig-based
// event/prop disambiguation, exactly like every other adapter's flat-bag path).

import { createRenderer } from 'svelte/renderer';
import {
  appendChild as engineAppendChild,
  insertBefore as engineInsertBefore,
  removeChild as engineRemoveChild,
  createElement as engineCreateElement,
  createRawText,
  createAnchor,
  isAnchor,
  routeProp,
  setEventListener,
  setText as engineSetText,
  toPublicInstance,
  RAW_TEXT_COMPONENT,
  type ISymbioteNode,
  type SymbioteSurface,
  type IHostInstance,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';
import { normalizeSvelteClass } from './class-value';

// Fabric has no fragment primitive: a fragment is a transient, engine-invisible container that
// `insert()` flattens into a real parent, mirroring the DOM spec rule "inserting a fragment
// inserts its children, leaving the fragment empty" — the same rule the retired shim's
// ShimDocumentFragment implemented, now against the official Renderer contract instead.
export interface IFragmentNode {
  readonly isFragment: true;
  children: TRendererNode[];
  parent: TRendererNode | null;
}

export type TRendererNode = ISymbioteNode | IFragmentNode;

export function isFragmentNode(node: TRendererNode): node is IFragmentNode {
  return 'isFragment' in node;
}

// Tracks a real engine node's LOGICAL parent while it sits inside an uncommitted fragment
// (before that fragment is itself inserted into a real element). The engine's own
// `ISymbioteNode.parent` field only ever points at another ISymbioteNode (node.ts), so a
// fragment parent cannot live there — mirrors the engine's own WeakMap side-table pattern
// (node.ts's classStyleParts) rather than mutating engine-owned node shape. Cleared the moment a
// node moves into a real parent, so `getParent` always prefers a live engine `.parent` over a
// stale entry here.
const fragmentParentOf = new WeakMap<ISymbioteNode, IFragmentNode>();

// iOS's real Switch prop name (`onTintColor`, UISwitch's own API) collides with Svelte's
// on-prefix-is-always-an-event compile-time rule (`is_event_attribute = name.startsWith('on')`,
// checked on the ATTRIBUTE NAME alone, with no runtime ViewConfig awareness — unlike routeProp's
// `isEventFor` check every other adapter relies on). `render-switch.ts` (core/components, shared
// across every adapter) cannot special-case this for us without breaking that shared boundary,
// so components/switch renames the key before spreading it into markup and this table reverses
// the rename before the value reaches `routeProp`. The only known case (2026-08-16 audit of every
// core/components/src/view/render-*.ts and state/*.ts for an on-prefixed non-function prop) —
// grow this table, do not invent a generic heuristic, if a future component hits the same wall.
// iOS's real Switch prop name (`onTintColor`) is the ONE known on-prefix collision (rare — audit
// every core/components/src/view/render-*.ts, grow this table by hand, never a heuristic).
// `style` is a SECOND, UNIVERSAL collision, confirmed 2026-08-16 (scroll-view migration):
// Svelte's compiler recognizes the literal key `'style'` specially — both as a direct
// `style={...}` attribute AND as a `style` key inside a `{...spread}` — and routes it through its
// own `$.set_style()` -> `to_style()` (`svelte/internal/shared/attributes.js`), which is a
// DOM-CSS-text pipeline: with no compiler-tracked `style:` directive structure (our case, always,
// since we author `style={value}` as a plain prop), `to_style` unconditionally does
// `value = String(value)` — our `IStyleProp` object/array becomes `"[object Object]"` (or worse
// for an array) BEFORE it ever reaches this file's `setAttribute`. Verified by compiling
// `<symbiote-view style={{padding:8}}>` and reading the generated `$.set_style(...)` call, then
// reading `to_style`'s source directly. Renaming the key sidesteps Svelte's special case
// entirely — `symbioteStyle` doesn't match `key === 'style'`, so it falls through to the ordinary
// per-key `attribute_effect` path, reaching `setAttribute` with the value UNTOUCHED, exactly like
// any other prop.
export const TEMPLATE_KEY_UNMANGLE: Readonly<Record<string, string>> = {
  symbioteValueOnTintColor: 'onTintColor',
  symbioteStyle: 'style',
};

function realPropName(key: string): string {
  return TEMPLATE_KEY_UNMANGLE[key] ?? key;
}

const TEMPLATE_SAFE_PROP_NAME: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(TEMPLATE_KEY_UNMANGLE).map(([templateSafe, real]) => [real, templateSafe]),
);

// The forward half of `TEMPLATE_KEY_UNMANGLE`: every component calls this on its resolved props
// object before spreading it into a `symbiote-*` intrinsic's markup, so the template never
// authors a literal `style` (or, for Switch, `onTintColor`) attribute name that Svelte's compiler
// would misparse. `setAttributeOp`'s `realPropName()` reverses the rename right before
// `routeProp`. Named for what it does generically now, not just the original on-prefix case —
// `remapOnPrefixedValueProps` is kept as an alias so already-migrated call sites keep working.
export function toTemplateSafeProps(props: Record<string, unknown>): Record<string, unknown> {
  let result: Record<string, unknown> | undefined;
  for (const [real, templateSafe] of Object.entries(TEMPLATE_SAFE_PROP_NAME)) {
    if (!(real in props)) continue;
    result ??= { ...props };
    delete result[real];
    result[templateSafe] = props[real];
  }
  return result ?? props;
}

export const remapOnPrefixedValueProps = toTemplateSafeProps;

export function createFragmentNode(): IFragmentNode {
  return { isFragment: true, children: [], parent: null };
}

export function createElementNode(name: string): ISymbioteNode {
  const descriptor = descriptorFor(name);
  return toPublicInstance(engineCreateElement(descriptor.component, descriptor.isText));
}

export function createTextNodeOp(data: string): ISymbioteNode {
  return createRawText(data);
}

// A comment is used purely as a positional anchor (the universal `insert(parent, dom, anchor)`
// mount path) — the engine's own anchor nodes are already skipped by the commit walk, so this
// needs no special commit-time handling, matching every other adapter's anchor use.
export function createCommentNode(_data: string): ISymbioteNode {
  return createAnchor();
}

export function getParentNode(node: TRendererNode): TRendererNode | null {
  if (isFragmentNode(node)) return node.parent;
  return fragmentParentOf.get(node) ?? node.parent ?? null;
}

// `.children` differs by element type only in which node types it's allowed to hold
// (`ISymbioteNode[]` vs `TRendererNode[]`) — both are real arrays of TRendererNode-compatible
// entries at runtime, so this narrows once, centrally, rather than repeating the
// `isFragmentNode` branch in every accessor below.
function childrenOf(element: TRendererNode): TRendererNode[] {
  return isFragmentNode(element) ? element.children : element.children;
}

export function getFirstChildNode(element: TRendererNode): TRendererNode | null {
  return childrenOf(element)[0] ?? null;
}

export function getLastChildNode(element: TRendererNode): TRendererNode | null {
  const children = childrenOf(element);
  return children[children.length - 1] ?? null;
}

export function getNextSiblingNode(node: TRendererNode): TRendererNode | null {
  const parent = getParentNode(node);
  if (parent === null) return null;
  const siblings = childrenOf(parent);
  const index = siblings.indexOf(node);
  return index < 0 ? null : (siblings[index + 1] ?? null);
}

export function removeNode(node: ISymbioteNode): void {
  const fragmentParent = fragmentParentOf.get(node);
  if (fragmentParent !== undefined) {
    const index = fragmentParent.children.indexOf(node);
    if (index >= 0) fragmentParent.children.splice(index, 1);
    fragmentParentOf.delete(node);
    return;
  }
  if (node.parent === undefined) return;
  engineRemoveChild(node.parent, node);
}

export function insertNode(
  parent: TRendererNode,
  node: TRendererNode,
  anchor: ISymbioteNode | null,
): void {
  if (isFragmentNode(node)) {
    for (const child of [...node.children]) insertNode(parent, child, anchor);
    return;
  }
  removeNode(node);
  if (isFragmentNode(parent)) {
    fragmentParentOf.set(node, parent);
    const index = anchor === null ? -1 : parent.children.indexOf(anchor);
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
    return;
  }
  fragmentParentOf.delete(node);
  if (anchor === null) {
    engineAppendChild(parent, node);
  } else {
    engineInsertBefore(parent, node, anchor);
  }
}

// `class`/`className` route through the shared style registry (same normalization every other
// adapter applies) before reaching `routeProp` — mirrors the retired shim's
// `normalizeBagClasses`, just applied per-key instead of per-bag.
const CLASS_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set(['class', 'className']);

export function setAttributeOp(element: ISymbioteNode, key: string, value: unknown): void {
  const realKey = realPropName(key);
  const resolved = CLASS_ATTRIBUTE_KEYS.has(realKey) ? normalizeSvelteClass(value) : value;
  routeProp(element, realKey, resolved);
}

export function getAttributeOp(element: ISymbioteNode, name: string): string | null {
  const value = element.props[realPropName(name)];
  return value === undefined ? null : String(value);
}

export function removeAttributeOp(element: ISymbioteNode, name: string): void {
  setAttributeOp(element, name, undefined);
}

export function hasAttributeOp(element: ISymbioteNode, name: string): boolean {
  return realPropName(name) in element.props;
}

export function setTextOp(node: ISymbioteNode, text: string): void {
  if (isAnchor(node)) {
    node.props.text = text;
    return;
  }
  engineSetText(node, text);
}

export function getNodeValueOp(node: TRendererNode): string | null {
  if (isFragmentNode(node)) return null;
  if (node.component === RAW_TEXT_COMPONENT || isAnchor(node)) {
    return typeof node.props.text === 'string' ? node.props.text : null;
  }
  return null;
}

export function nodeTypeOp(node: TRendererNode): 'fragment' | 'element' | 'text' | 'comment' {
  if (isFragmentNode(node)) return 'fragment';
  if (isAnchor(node)) return 'comment';
  if (node.component === RAW_TEXT_COMPONENT) return 'text';
  return 'element';
}

// `onX` handler props reach here directly — the compiler treats any on-prefixed template
// attribute as an event unconditionally (svelte-adapter-custom-renderer skill), so this is now a
// STRUCTURAL event path like Vue's/Angular's, not a flat-bag one: Svelte hands us its own
// already-slice()'d name (`onPress` -> `'Press'`), which we lowercase-first-char the same way
// `routeProp`'s ON_PREFIX branch already does for every other adapter, then forward straight to
// the engine's shared listener map.
function listenerNameFromSvelte(type: string): string {
  return type.charAt(0).toLowerCase() + type.slice(1);
}

export function addEventListenerOp(
  target: ISymbioteNode,
  type: string,
  handler: (event: unknown) => unknown,
): void {
  setEventListener(target, listenerNameFromSvelte(type), handler);
}

export function removeEventListenerOp(target: ISymbioteNode, type: string): void {
  setEventListener(target, listenerNameFromSvelte(type), undefined);
}

// The one surface currently mounted (svelte-adapter-custom-renderer skill: single root per
// process, same invariant the retired shim's `patchGlobals()` relied on). `render.ts` sets this
// before calling `svelteMount()` and clears it on teardown.
let activeSurface: SymbioteSurface | undefined;

export function setActiveSurface(surface: SymbioteSurface | undefined): void {
  activeSurface = surface;
}

// Every mutating op ends by coalescing a commit on the active surface, matching every other
// adapter's "mutate then requestCommit" shape (adapters/vue/src/renderer.ts, adapters/angular's
// Renderer2). A no-op before the first mount / after teardown. Exported as `requestActiveCommit`
// for the JS-only imperative tree builder (descriptor-to-svelte.ts), which mutates engine nodes
// directly via `appendChild`/`removeChild` rather than through this renderer's own `insert`/
// `remove` — those calls need the SAME coalesced commit this module's own Renderer methods get,
// or a subtree built that way (e.g. a third-party view mounted via `mountDescriptorChildren`)
// lands in the retained tree but never reaches Fabric (found 2026-08-16 debugging
// packages/slider's Svelte wrapper — see skill §10).
function requestCommit(): void {
  activeSurface?.requestCommit();
}

export const requestActiveCommit = requestCommit;

export type ISymbioteRenderer = ReturnType<typeof buildRenderer>;

function buildRenderer() {
  return createRenderer<{
    fragment: IFragmentNode;
    element: ISymbioteNode;
    text: ISymbioteNode;
    comment: ISymbioteNode;
  }>({
    createFragment: createFragmentNode,
    createElement: createElementNode,
    createTextNode: createTextNodeOp,
    createComment: createCommentNode,
    nodeType: nodeTypeOp,
    getNodeValue: getNodeValueOp,
    getAttribute: getAttributeOp,
    setAttribute(element, key, value) {
      setAttributeOp(element, key, value);
      requestCommit();
    },
    removeAttribute(element, name) {
      removeAttributeOp(element, name);
      requestCommit();
    },
    hasAttribute: hasAttributeOp,
    setText(node, text) {
      setTextOp(node, text);
      requestCommit();
    },
    getFirstChild: getFirstChildNode,
    getLastChild: getLastChildNode,
    getNextSibling: getNextSiblingNode,
    insert(parent, node, anchor) {
      insertNode(parent, node, anchor);
      requestCommit();
    },
    remove(node) {
      removeNode(node);
      requestCommit();
    },
    getParent: getParentNode,
    addEventListener: addEventListenerOp,
    removeEventListener: removeEventListenerOp,
  });
}

// The one renderer instance — imported by every compiled `.svelte` component (via the
// `experimental.customRenderer` module specifier, see this file's header) AND passed explicitly
// by `render.ts`'s `mount()` call, so both wiring paths agree on the exact same object.
export const symbioteRenderer = buildRenderer();

export default symbioteRenderer;

export type { ISymbioteNode, SymbioteSurface, IHostInstance };
