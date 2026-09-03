// A Vue 3 custom renderer over @symbiote-native/engine. Each RendererOptions method maps onto
// the engine's tiny mutation API; the engine owns all Fabric clone-on-write, so Vue
// drives the exact same retained tree React does: the proof the core is framework-
// agnostic.

import { createRenderer, type RendererOptions } from '@vue/runtime-core';
import {
  appendChild,
  createAnchor,
  createElement,
  createRawText,
  dlog,
  insertBefore,
  removeChild,
  routeProp,
  setProp,
  setText,
  toPublicInstance,
  RAW_TEXT_COMPONENT,
  SymbioteSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';
import { normalizeVueAttrKey } from '../utils/normalize-attrs';
import { registerVueOwnerTagging } from './devtools-owner';

registerVueOwnerTagging();

// Vue host nodes are all SymbioteNode (elements, raw text, anchors). The mount
// container is the surface, so a parent can be either a node or the surface root.
type IHostNode = ISymbioteNode;
type IHostElement = ISymbioteNode | SymbioteSurface;

function isSurface(parent: IHostElement): parent is SymbioteSurface {
  return parent instanceof SymbioteSurface;
}

function isRawText(node: ISymbioteNode): boolean {
  return node.component === RAW_TEXT_COMPONENT;
}

// RN's Text.js applies two defaults on the way to native (core/components/src/text-props.ts:
// ellipsizeMode 'tail', allowFontScaling true unless literally false). The Vue <Text> wrapper
// folded them with resolveTextProps; a template that the SFC transformer lowered to the
// intrinsic `symbiote-text` has no wrapper, so the renderer seeds them instead. Without this a
// numberOfLines={1} line clips mid-word with no ellipsis — device-observed, and silent.
const TEXT_DEFAULTS: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  ['ellipsizeMode', 'tail'],
  ['allowFontScaling', true],
]);

function seedTextDefaults(node: ISymbioteNode): void {
  for (const [key, value] of TEXT_DEFAULTS) setProp(node, key, value);
}

// RN's `id` is the modern W3C-named alias for `nativeID` — View.js copies it over
// (`processedProps.nativeID = id`), so the two name ONE native prop. React folds it in its
// component wrapper and Svelte and Solid in their transforms; Vue had it nowhere, so `<View
// id="x">` reached Fabric with an unknown `id` and no `nativeID`, silently and on device only.
// It lives in the renderer rather than in a transform because that covers all four Vue paths at
// once — lowered SFC, lowered TSX, the component wrapper, and a hand-written
// `h('symbiote-view', { id })` no compiler ever sees.
//
// Caveat, and it matches what Solid's compile-time rename already does: with BOTH `id` and
// `nativeID` on one element the last patchProp wins, where upstream gives `id` priority
// unconditionally. Honouring that needs per-node state to remember an `id` arrived; no example or
// test sets both, so the state is not worth carrying.
const PROP_ALIASES: ReadonlyMap<string, string> = new Map([['id', 'nativeID']]);

// An explicit `undefined` must NOT clear one of those defaults: RN treats a missing prop and an
// explicit undefined alike, and only a literal `false` opts out of allowFontScaling. Reached
// only when a value is already undefined, so it costs nothing on the hot path.
function textDefaultFor(node: ISymbioteNode, key: string): unknown {
  return node.isText ? TEXT_DEFAULTS.get(key) : undefined;
}

// One renderer per mounted surface: the options close over the surface so every mutation
// can ask it to (microtask-coalesced) recommit. Vue has no resetAfterCommit; instead
// requestCommit() collapses a burst of insert/patchProp within one tick into a single
// completeRoot, exactly the seam the engine already exposes for reactive frameworks.
export function createSymbioteRenderer(surface: SymbioteSurface) {
  const options: RendererOptions<IHostNode, IHostElement> = {
    createElement(type) {
      const descriptor = descriptorFor(type);
      // `type` as the third argument, not just `descriptor.component`: the behavior registry is
      // keyed by the INTRINSIC TAG (`symbiote-pressable`), while a node only ever carries the
      // resolved Fabric name (`RCTView`). This is the one place that still holds both, so a
      // lowered primitive whose machine lives on the engine node can be matched at all.
      const node = createElement(descriptor.component, descriptor.isText, type);
      if (descriptor.isText) seedTextDefaults(node);
      // The imperative public-instance API (measure / setNativeProps / focus / …) is already on
      // the node's prototype, so a template/function ref to a host element exposes it exactly
      // like React's getPublicInstance and toPublicInstance is the identity. The ref must keep
      // holding this raw node by identity (shallowRef), never a deep ref — the engine commit
      // mirror is keyed on it.
      //
      // The message is a THUNK, not a template literal: this runs once per node — 9 000 times on
      // one benchmark press — and a literal is built at the call site before dlog can decide
      // anything (see core/engine/src/debug.ts).
      dlog(
        () => `vue createElement ${descriptor.component} -> public instance`,
      );
      return toPublicInstance(node);
    },

    createText(text) {
      // Vue mounts Fragment boundaries (v-for / v-if lists / multi-root) as EMPTY text
      // nodes via hostCreateText(''), NOT comments, then inserts them into the (usually
      // non-Text) container. A raw text outside a <Text> is invalid in Fabric, so an empty
      // text here is never real content; it's a positional anchor. Map it to an engine
      // anchor (skipped by the commit walk, no native view), exactly like createComment.
      // Non-empty text is genuine RCTRawText content and must live inside a <Text>.
      return text === '' ? createAnchor() : createRawText(text);
    },

    // Fragment / v-if / v-for placeholder. A real retained node so insert/nextSibling/
    // parentNode ordering stays correct, but the engine's commit walk skips it: no
    // native view is ever created. (A comment can't just be an empty text node here —
    // an empty RCTRawText would actually paint, so an anchor is the right call.)
    createComment() {
      return createAnchor();
    },

    setText(node, text) {
      setText(node, text);
      surface.requestCommit();
    },

    setElementText(el, text) {
      if (isSurface(el)) return;
      // Same invariant insert() enforces, on the other route text can reach a node: Vue calls
      // this instead of insert() when an element's children collapse to a single string, so
      // without the check a raw text lands under a non-Text parent - an invalid Fabric tree
      // built silently, which is worse than the throw insert() would have given.
      if (!el.isText) {
        throw new Error(
          `Text string "${text}" must be rendered inside a <Text>`,
        );
      }
      // An RCTText carries its string as a single raw-text child. Reuse a lone existing
      // one to avoid churn; otherwise replace all children with a fresh raw-text node.
      const [first] = el.children;
      if (el.children.length === 1 && first !== undefined && isRawText(first)) {
        setText(first, text);
      } else {
        for (const child of el.children.slice()) removeChild(el, child);
        appendChild(el, createRawText(text));
      }
      surface.requestCommit();
    },

    insert(child, parent, anchor) {
      if (isRawText(child) && (isSurface(parent) || !parent.isText)) {
        throw new Error(
          `Text string "${String(child.props.text)}" must be rendered inside a <Text>`,
        );
      }
      if (isSurface(parent)) {
        if (anchor) parent.insertBefore(child, anchor);
        else parent.appendChild(child);
      } else if (anchor) {
        insertBefore(parent, child, anchor);
      } else {
        appendChild(parent, child);
      }
      surface.requestCommit();
    },

    remove(child) {
      // A top-level node has no parent (it lives in surface.children); everything else
      // detaches from its retained parent.
      const parent = child.parent;
      if (parent !== undefined) removeChild(parent, child);
      else surface.removeChild(child);
      surface.requestCommit();
    },

    parentNode(node) {
      return node.parent ?? surface;
    },

    nextSibling(node) {
      const siblings =
        node.parent !== undefined ? node.parent.children : surface.children;
      const index = siblings.indexOf(node);
      return index >= 0 ? (siblings[index + 1] ?? null) : null;
    },

    patchProp(el, key, _prev, next) {
      if (isSurface(el)) return;
      // Kebab -> camel happens HERE, not only inside a component wrapper: the SFC transformer
      // lowers View/Text to their intrinsic tags (metro-vue-transformer.cjs), so those props
      // arrive one key at a time with no component to fold the bag. Idempotent for the wrapped
      // path, which already normalized.
      const normalized = normalizeVueAttrKey(key);
      const name = PROP_ALIASES.get(normalized) ?? normalized;
      // routeProp makes the prop-vs-event decision from the node's ViewConfig (onPress on a
      // View becomes a listener; onTintColor on a Switch stays a prop), shared with React. The
      // class/style merge (explicit :style always winning, regardless of which of Vue's two
      // independent patchProp calls lands last) is centralized there too (core/engine/src/node.ts).
      routeProp(el, name, next === undefined ? textDefaultFor(el, name) : next);
      surface.requestCommit();
    },

    // RN has no querySelector / scope-id / innerHTML. The first two are inert; static
    // hoisting is meaningless without a raw-HTML host, so insertStaticContent degrades to
    // an empty anchor pair (logged, never painting) rather than crashing Vue's contract.
    querySelector: () => null,
    setScopeId: () => {},
    insertStaticContent(_content, parent, anchor) {
      dlog('vue insertStaticContent unsupported — degrading to empty anchor');
      const node = createAnchor();
      options.insert(node, parent, anchor ?? null);
      return [node, node];
    },
  };

  return createRenderer<IHostNode, IHostElement>(options);
}
