// A Vue 3 custom renderer over @symbiote-native/engine
// Each RendererOptions method maps onto the engine's mutation API, which owns all clone-on-write

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
  setText,
  textOf,
  toPublicInstance,
  SymbioteSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';
import { normalizeVueAttrKey } from '../utils/normalize-attrs';
import { dropDevLinks } from './dev-links';

// The mount container is the surface, so a parent is either a node or the surface root
type IHostNode = ISymbioteNode;
type IHostElement = ISymbioteNode | SymbioteSurface;
type IPatchPropArgs = Parameters<
  RendererOptions<IHostNode, IHostElement>['patchProp']
>;
type IListener = (...args: unknown[]) => unknown;

function isSurface(parent: IHostElement): parent is SymbioteSurface {
  return parent instanceof SymbioteSurface;
}

function isRawText(node: ISymbioteNode): boolean {
  return isRawTextNode(node);
}

// The same naming JSX uses to tell an event from a value prop, without copying `routeProp`'s lists
const EVENT_PROP_NAME = /^on[A-Z]/;

// A native event calls the listener outside any Vue render, so a throw escaped `errorHandler`
// This is the sync form: responder callbacks return a boolean the engine reads at once
function wrapListenerForErrorHandling(
  listener: IListener,
  instance: ComponentInternalInstance | null,
): IListener {
  const wrapper = (...args: unknown[]): unknown =>
    callWithErrorHandling(
      listener,
      instance,
      ErrorCodes.NATIVE_EVENT_HANDLER,
      args,
    );
  // `Animated.event`'s handler carries `__getEvent`, which the native-driver attach path reads
  // from the prop value, so a bare closure would break it
  return Object.assign(wrapper, listener);
}

function createHostNode(type: string) {
  const descriptor = descriptorFor(type);
  // `type` goes third: behaviors are keyed by the intrinsic tag, nodes carry the Fabric name
  const node = createElement(descriptor.component, descriptor.isText, type);
  // A thunk, since this runs once per node and a literal would be built before `dlog` decides
  dlog(() => `vue createElement ${descriptor.component} -> public instance`);
  // `markRaw` is load-bearing: a readonly proxy over the node turns `setNativeProps` into a no-op
  return markRaw(toPublicInstance(node));
}

// Vue mounts fragment boundaries as empty text, which would paint in Fabric, so they become anchors
function createHostText(text: string): IHostNode {
  return text === '' ? createAnchor() : createRawText(text);
}

function setHostElementText(el: IHostNode, text: string): void {
  // Vue calls this instead of `insert` for a lone string, so the Text-parent check repeats
  if (!isTextContainer(el)) {
    throw new Error(`Text string "${text}" must be rendered inside a <Text>`);
  }
  // An RCTText holds its string as one raw-text child: reuse it rather than churn
  const existing = childrenOf(el);
  const [first] = existing;
  if (existing.length === 1 && first !== undefined && isRawText(first)) {
    setText(first, text);
    return;
  }
  for (const child of existing.slice()) removeChild(el, child);
  appendChild(el, createRawText(text));
}

function insertHostNode(
  child: IHostNode,
  parent: IHostElement,
  anchor: IHostNode | null | undefined,
): void {
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
}

// `parentComponent` is the sixth argument, as `getCurrentInstance()` is already null by then
function patchHostProp(surface: SymbioteSurface, args: IPatchPropArgs): void {
  const [el, key, prev, next, , parentComponent] = args;
  if (isSurface(el)) return;
  // `value` arrives unchanged on every re-render, so the route is skipped when `prev` equals it
  // The commit request still goes out: the controlled handshake reads `value` after the commit
  if (key !== 'value' || prev !== next) {
    const name = normalizeVueAttrKey(key);
    const isEvent = EVENT_PROP_NAME.test(name) && typeof next === 'function';
    routeProp(
      el,
      name,
      isEvent
        ? wrapListenerForErrorHandling(next, parentComponent ?? null)
        : next,
    );
  }
  surface.requestCommit();
}

// One renderer per mounted surface, so every mutation can ask it for a microtask-coalesced commit
export function createSymbioteRenderer(surface: SymbioteSurface) {
  const options: RendererOptions<IHostNode, IHostElement> = {
    createElement: createHostNode,
    createText: createHostText,
    createComment: () => createAnchor(),
    setText(node, text) {
      setText(node, text);
      surface.requestCommit();
    },
    setElementText(el, text) {
      if (isSurface(el)) return;
      setHostElementText(el, text);
      surface.requestCommit();
    },
    insert(child, parent, anchor) {
      insertHostNode(child, parent, anchor);
      surface.requestCommit();
    },
    remove(child) {
      // A top-level node has no parent, it lives in `surface.children`
      const parent = parentOf(child);
      if (parent === undefined) surface.removeChild(child);
      else removeChild(parent, child);
      dropDevLinks(child);
      surface.requestCommit();
    },
    parentNode: node => parentOf(node) ?? surface,
    nextSibling: node => nextSiblingOf(node, surface) ?? null,
    patchProp: (...args) => patchHostProp(surface, args),
    // No `querySelector` or `innerHTML` on RN: static content degrades to an anchor pair
    querySelector: () => null,
    setScopeId: () => {},
    insertStaticContent(_content, parent, anchor) {
      dlog('vue insertStaticContent unsupported, degrading to empty anchor');
      const node = createAnchor();
      options.insert(node, parent, anchor ?? null);
      return [node, node];
    },
  };

  return createRenderer<IHostNode, IHostElement>(options);
}
