// The write half of a tree host that keeps its own node graph. The headless host and the DOM host
// differ in what a create or a move does to the world, so those arrive as `effects`

import type { IOpVisitor } from './mutation-walk';
import { RAW_TEXT_COMPONENT } from './node-types';
import type { IRetainedNode } from './retained-tree';

export const RETAINED_KIND = {
  element: 'element',
  text: 'text',
  anchor: 'anchor',
  void: 'void',
} as const;

export type IRetainedKind = (typeof RETAINED_KIND)[keyof typeof RETAINED_KIND];

// The one prop a raw text has: its content
const TEXT_PROP = 'text';

// What a create op says about the node, for the store to turn into its own node type
export type IRetainedCreate = {
  kind: IRetainedKind;
  viewName: string;
  text?: string;
  instanceHandle?: unknown;
};

// A retained node the visitor may write to
export type IRetainedNodeState<TNode> = IRetainedNode<TNode> & {
  viewName: string;
  props: Record<string, unknown>;
  tagName: string;
  ownedListeners: Record<string, boolean>;
  underlayShown: boolean;
  parent: TNode | undefined;
  children: TNode[];
  committedRootTag: number | undefined;
};

export type IRetainedStore<TNode> = {
  // Throws for a handle the host never saw
  at: (handle: object) => TNode;
  create: (handle: object, spec: IRetainedCreate) => void;
};

// Each runs after the logical tree changed, so a host can bring its own world in line
export type IRetainedEffects<TNode> = {
  placed?: (node: TNode) => void;
  removed?: (node: TNode) => void;
  textChanged?: (node: TNode, text: string) => void;
  propChanged?: (node: TNode) => void;
  componentChanged?: (node: TNode) => void;
  committed?: (rootTag: number, surface: TNode) => void;
};

function unlink<TNode extends IRetainedNodeState<TNode>>(child: TNode): void {
  const { parent } = child;
  if (parent === undefined) return;
  const at = parent.children.indexOf(child);
  if (at >= 0) parent.children.splice(at, 1);
  child.parent = undefined;
}

// Re-parent a node, before `before` or last when `before` is not among the parent's children
function adopt<TNode extends IRetainedNodeState<TNode>>(
  parent: TNode,
  child: TNode,
  before?: TNode,
): void {
  unlink(child);
  child.parent = parent;
  const index = before === undefined ? -1 : parent.children.indexOf(before);
  if (index < 0) parent.children.push(child);
  else parent.children.splice(index, 0, child);
}

// Lands a `rootTag` onto a whole subtree, never cleared afterwards, т.к. a removal cuts the parent
// link and a parting write in the teardown sweep must still reach the node
function markCommitted<TNode extends IRetainedNodeState<TNode>>(
  node: TNode,
  rootTag: number,
): void {
  node.committedRootTag = rootTag;
  for (const child of node.children) markCommitted(child, rootTag);
}

export function createRetainedVisitor<TNode extends IRetainedNodeState<TNode>>(
  store: IRetainedStore<TNode>,
  effects: IRetainedEffects<TNode> = {},
): IOpVisitor {
  const { at, create } = store;
  const place = (parent: object, child: object, before?: object): void => {
    const node = at(child);
    adopt(at(parent), node, before === undefined ? undefined : at(before));
    effects.placed?.(node);
  };
  // A prop or an owned listener changes what the host puts on the element, so both name the node
  const writeAndName = (handle: object, write: (node: TNode) => void): void => {
    const node = at(handle);
    write(node);
    effects.propChanged?.(node);
  };
  return {
    createElement: (handle, viewName, instanceHandle) =>
      create(handle, { kind: RETAINED_KIND.element, viewName, instanceHandle }),
    createRawText: (handle, text) =>
      create(handle, {
        kind: RETAINED_KIND.text,
        viewName: RAW_TEXT_COMPONENT,
        text,
      }),
    createAnchor: handle =>
      create(handle, { kind: RETAINED_KIND.anchor, viewName: '' }),
    createVoid: handle =>
      create(handle, { kind: RETAINED_KIND.void, viewName: '' }),
    appendChild: (parent, child) => place(parent, child),
    insertBefore: (parent, child, before) => place(parent, child, before),
    removeChild: (_parent, child) => {
      const node = at(child);
      unlink(node);
      effects.removed?.(node);
    },
    // A raw text holds its content as its `text` prop, so a behavior that routes a title there
    // changes the text the same way `setText` does
    setProp: (handle, key, value) => {
      const node = at(handle);
      node.props[key] = value;
      const isContent =
        node.viewName === RAW_TEXT_COMPONENT &&
        key === TEXT_PROP &&
        typeof value === 'string';
      if (isContent) effects.textChanged?.(node, value);
      else effects.propChanged?.(node);
    },
    deleteProp: (handle, key) =>
      writeAndName(handle, node => {
        delete node.props[key];
      }),
    setText: (handle, text) => {
      const node = at(handle);
      node.props[TEXT_PROP] = text;
      effects.textChanged?.(node, text);
    },
    setComponent: (handle, viewName) => {
      const node = at(handle);
      node.viewName = viewName;
      effects.componentChanged?.(node);
    },
    setTag: (handle, tag) => {
      at(handle).tagName = tag;
    },
    setOwnedListener: (handle, name, isPresent) =>
      writeAndName(handle, node => {
        node.ownedListeners[name] = isPresent;
      }),
    setUnderlayShown: (handle, isShown) =>
      writeAndName(handle, node => {
        node.underlayShown = isShown;
      }),
    commit: (rootTag, surface) => {
      const node = at(surface);
      markCommitted(node, rootTag);
      effects.committed?.(rootTag, node);
    },
  };
}
