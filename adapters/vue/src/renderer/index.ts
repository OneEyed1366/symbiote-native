// A Vue 3 custom renderer over @symbiote-native/engine. Each RendererOptions method maps onto
// the engine's tiny mutation API; the engine owns all Fabric clone-on-write, so Vue
// drives the exact same retained tree React does: the proof the core is framework-
// agnostic.

import {
  callWithErrorHandling,
  createRenderer,
  ErrorCodes,
  markRaw,
  type ComponentInternalInstance,
  type RendererOptions,
} from '@vue/runtime-core';
import {
  appendChild,
  createAnchor,
  createElement,
  createRawText,
  childrenOf,
  dlog,
  insertBefore,
  isRawTextNode,
  isTextContainer,
  nextSiblingOf,
  parentOf,
  removeChild,
  routeProp,
  setProp,
  setText,
  textOf,
  toPublicInstance,
  SymbioteSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';
import { normalizeVueAttrKey } from '../utils/normalize-attrs';

// Vue host nodes are all SymbioteNode (elements, raw text, anchors). The mount
// container is the surface, so a parent can be either a node or the surface root.
type IHostNode = ISymbioteNode;
type IHostElement = ISymbioteNode | SymbioteSurface;

function isSurface(parent: IHostElement): parent is SymbioteSurface {
  return parent instanceof SymbioteSurface;
}

function isRawText(node: ISymbioteNode): boolean {
  return isRawTextNode(node);
}

// RN's Text.js applies two defaults on the way to native (core/components/src/text-props.ts:
// ellipsizeMode 'tail', allowFontScaling true unless literally false). The Vue <Text> wrapper
// folded them with resolveTextProps; a `<text>` tag has no wrapper, so the renderer seeds them
// instead. Without this a numberOfLines={1} line clips mid-word with no ellipsis — device-observed,
// and silent.
const TEXT_DEFAULTS: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  ['ellipsizeMode', 'tail'],
  ['allowFontScaling', true],
]);

// THE SEED IS GONE, and the defaults now come from the payload builder
// (`applyTextDefaults` in `core/engine/src/fabric-props.ts`, and its twin in
// `SymbioteFabricProps.cpp`). Writing them as props cost a crossing each time the app authored the
// same value: measured at 6 000 wasted writes per 1 000-row create with the `writesOfUnchanged`
// counter, against zero for React, which folds instead. `TEXT_DEFAULTS` stays for `textDefaultFor`
// below, which is the clear-back-to-undefined path and not the create path.

// RN's `id` is the modern W3C-named alias for `nativeID` — View.js copies it over
// (`processedProps.nativeID = id`), so the two name ONE native prop. React folds it in its
// component wrapper and Svelte and Solid elsewhere; Vue had it nowhere, so `<view id="x">` reached
// Fabric with an unknown `id` and no `nativeID`, silently and on device only. It lives in the
// renderer because that covers every Vue path at once — SFC, TSX, and a hand-written
// `h('view', { id })` no compiler ever sees.
//
// Caveat, and it matches what Solid's compile-time rename already does: with BOTH `id` and
// `nativeID` on one element the last patchProp wins, where upstream gives `id` priority
// unconditionally. Honouring that needs per-node state to remember an `id` arrived; no example or
// test sets both, so the state is not worth carrying.
const PROP_ALIASES: ReadonlyMap<string, string> = new Map([['id', 'nativeID']]);

// RN-style event prop naming ('onPress', 'onValueChange', ...), the same convention JSX itself
// uses to separate an event from a plain value prop — good enough to decide whether to wrap,
// without duplicating routeProp's own ViewConfig-derived event lists here.
const EVENT_PROP_NAME = /^on[A-Z]/;

// A native event (a Fabric touch, a responder gesture) invokes a Pressable/TextInput/etc.
// listener straight out of the engine's own event dispatch (core/engine/src/dispatch.ts,
// core/components/src/behaviors/pressable.ts's `dispatch`), entirely outside anything Vue ever
// wraps — no render, no watcher, no lifecycle hook sits between the native event and the app's
// callback. So a throw inside `onPress={throwNow}` was a genuinely UNCAUGHT JS exception: it
// skipped `onErrorCaptured`, skipped `app.config.errorHandler`, skipped even this adapter's own
// default reporter (render.ts's `reportToHost`) and reached Hermes's own top-level handler
// directly — the raw, component-stack-less redbox this was device-reported as, not the "vue
// render (...)" framed one `reportToHost` produces. Real Vue DOM has the identical seam
// (`patchEvent`'s `createInvoker`) for the identical reason: a DOM event is native too.
//
// Wrapping here, at `patchProp`, needs the OWNING instance — and `getCurrentInstance()` cannot
// supply it: Vue resets `currentRenderingInstance` at the END of `renderComponentRoot`, BEFORE
// the subsequent `patch()` call that actually reaches `mountElement`/`patchProp`, so by the time
// this runs it always reads null (measured via a real thrown press listener — `handleError` never
// found the `onErrorCaptured` ancestor because `if (instance)` was false). Real Vue DOM does not
// use `getCurrentInstance()` for this either: `hostPatchProp` is called with an explicit 6th
// argument, `parentComponent`, threaded down through `patch`/`mountElement` from the component
// whose render produced the vnode — the same instance the DOM renderer's own `patchEvent` passes
// to `callWithAsyncErrorHandling`. That parameter, not the global pointer, is the correct capture.
//
// `callWithErrorHandling` (the SYNC form, not `callWithAsyncErrorHandling`) is deliberate: a
// responder-negotiation callback (`onStartShouldSetResponder`, ...) returns a boolean the engine
// reads synchronously, and the sync form is the one that returns the call's result directly
// rather than folding it into promise-handling for the multi-hook case.
function wrapListenerForErrorHandling(
  listener: (...args: unknown[]) => unknown,
  instance: ComponentInternalInstance | null,
): (...args: unknown[]) => unknown {
  const wrapper = (...args: unknown[]): unknown =>
    callWithErrorHandling(
      listener,
      instance,
      ErrorCodes.NATIVE_EVENT_HANDLER,
      args,
    );
  // Some listeners are marker-carrying functions, not plain callbacks — Animated.event's
  // __getHandler() (core/engine/src/animated/event.ts) hands back exactly this shape,
  // `Object.assign((...) => {...}, { __getEvent: () => this })`, and the engine's native-driver
  // attach path reads `__getEvent` off the prop value it was given. A fresh closure with none of
  // the original's own properties silently breaks that — carry them forward.
  return Object.assign(wrapper, listener);
}

// An explicit `undefined` must NOT clear one of those defaults: RN treats a missing prop and an
// explicit undefined alike, and only a literal `false` opts out of allowFontScaling. Reached
// only when a value is already undefined, so it costs nothing on the hot path.
function textDefaultFor(node: ISymbioteNode, key: string): unknown {
  return isTextContainer(node) ? TEXT_DEFAULTS.get(key) : undefined;
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
      // keyed by the INTRINSIC TAG (`pressable`), while a node only ever carries the
      // resolved Fabric name (`RCTView`). This is the one place that holds both, so a primitive
      // whose machine lives on the engine node can be matched at all.
      const node = createElement(descriptor.component, descriptor.isText, type);
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
      // markRaw is load-bearing, not an optimization: useTemplateRef()'s return value is
      // `readonly(shallowRef(null))` (runtime-core.cjs.js), and Vue's readonly() wraps ANY
      // `.value` whose Object.prototype.toString reads "[object Object]" — true of a plain class
      // instance, unlike a real DOM Element, which fails that check for free. Unmarked, a node
      // reached through useTemplateRef() (not a plain ref()/shallowRef(), both of which skip the
      // wrap) came back as a deep-readonly Proxy: reads worked, so `committedOf`/`whenCommitted`
      // saw a "committed" node, but `setNativeProps`'s `node.props.style = …` silently no-op'd
      // with a dev-only "Set operation… target is readonly" warning — device-reported 2026-09-11
      // as "flash the right chip" doing nothing on press.
      return markRaw(toPublicInstance(node));
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
      if (!isTextContainer(el)) {
        throw new Error(
          `Text string "${text}" must be rendered inside a <Text>`,
        );
      }
      // An RCTText carries its string as a single raw-text child. Reuse a lone existing
      // one to avoid churn; otherwise replace all children with a fresh raw-text node.
      const existing = childrenOf(el);
      const [first] = existing;
      if (existing.length === 1 && first !== undefined && isRawText(first)) {
        setText(first, text);
      } else {
        for (const child of existing.slice()) removeChild(el, child);
        appendChild(el, createRawText(text));
      }
      surface.requestCommit();
    },

    insert(child, parent, anchor) {
      if (isRawText(child) && (isSurface(parent) || !isTextContainer(parent))) {
        throw new Error(
          `Text string "${textOf(child) ?? ''}" must be rendered inside a <Text>`,
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
      const parent = parentOf(child);
      if (parent !== undefined) removeChild(parent, child);
      else surface.removeChild(child);
      surface.requestCommit();
    },

    parentNode(node) {
      return parentOf(node) ?? surface;
    },

    nextSibling(node) {
      // `?? null` because Vue's RendererOptions types the miss as null, not undefined; the
      // engine answers undefined uniformly and the surface fallback lives there now.
      return nextSiblingOf(node, surface) ?? null;
    },

    patchProp(el, key, prev, next, _namespace, parentComponent) {
      if (isSurface(el)) return;
      // Kebab -> camel happens HERE, not only inside a component wrapper: the SFC transformer
      // lowers View/Text to their intrinsic tags (metro-vue-transformer.cjs), so those props
      // arrive one key at a time with no component to fold the bag. Idempotent for the wrapped
      // path, which already normalized.
      const normalized = normalizeVueAttrKey(key);
      const name = PROP_ALIASES.get(normalized) ?? normalized;
      const value = next === undefined ? textDefaultFor(el, name) : next;
      const routed =
        EVENT_PROP_NAME.test(name) && typeof value === 'function'
          ? wrapListenerForErrorHandling(value, parentComponent ?? null)
          : value;
      // routeProp makes the prop-vs-event decision from the node's ViewConfig (onPress on a
      // View becomes a listener; onTintColor on a Switch stays a prop), shared with React. The
      // class/style merge (explicit :style always winning, regardless of which of Vue's two
      // independent patchProp calls lands last) is centralized there too (core/engine/src/node.ts).
      //
      // `value` REACHES HERE UNCHANGED, on every re-render, and that is upstream by design:
      // `patchProps` excludes it from its own diff and then patches it on its own line
      // (@vue/runtime-core 3.5.39 — `if (next !== prev && key !== "value")`, then
      // `if ("value" in newProps)`). The reason is a DOM one: typing mutates `el.value` directly,
      // so what Vue last SET is not what the element now HOLDS, and only the element can say.
      // Upstream pairs it with a guard in the patcher, and that half we did not have — `patchDOMProp`
      // writes only on a difference against the element's live value (@vue/runtime-dom,
      // `if (oldValue !== newValue || !("_value" in el))`). So every `<text-input>` re-routed its
      // value on every re-render of its parent: 1 000 writes and ~6 000 wire slots per relabel of
      // the benchmark list, against solid's 0 for the identical tree.
      //
      // On `prev` rather than on the node's own prop: the divergence upstream protects against is
      // not visible from here — native text lives on the far side and TextInput's behavior owns the
      // mirror — and asking the host would cost a crossing per input per render to be told the
      // declarative value, which is what `prev` already is.
      //
      // The COMMIT REQUEST still goes out, which is why this skips the route and does not return.
      // The controlled handshake hangs off the commit beat, not off the write: `afterCommit` reads
      // the node's own `value` against its native mirror. An idle commit is O(1) (F-12) and its
      // post-commit hooks run whether or not the commit reached the host (F-7).
      if (key !== 'value' || prev !== next) {
        routeProp(el, name, routed);
      }
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
