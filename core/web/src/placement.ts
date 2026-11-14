// Where a logical node's DOM goes. An anchor flattens into its parent's child list, so a node's
// place in the document is read off the logical tree and not off its own parent link

import { RETAINED_KIND } from '@symbiote-native/engine/retained-visitor';
import { isElement } from './dom-guards';
import type { IDomNode } from './dom-node';

// The DOM nodes a logical node stands for, in order
function collectRendered(node: IDomNode, out: Node[]): void {
  if (node.kind === RETAINED_KIND.void) return;
  if (node.dom !== undefined) {
    out.push(node.dom);
    return;
  }
  for (const child of node.children) collectRendered(child, out);
}

function firstRendered(node: IDomNode): Node | undefined {
  if (node.kind === RETAINED_KIND.void) return undefined;
  if (node.dom !== undefined) return node.dom;
  for (const child of node.children) {
    const found = firstRendered(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

// The element a node's DOM lands in: the nearest element above it, and none under a void
function hostOf(node: IDomNode): Element | undefined {
  for (let up = node.parent; up !== undefined; up = up.parent) {
    if (up.kind === RETAINED_KIND.void) return undefined;
    if (up.kind === RETAINED_KIND.element) {
      return isElement(up.dom) ? up.dom : undefined;
    }
  }
  return undefined;
}

// The first DOM node after this one in its host, null when it is last. An anchor that ends
// without a sibling hands the question to its own parent
function nextRenderedAfter(node: IDomNode): Node | null {
  let cursor = node;
  while (cursor.parent !== undefined) {
    const siblings = cursor.parent.children;
    for (let at = siblings.indexOf(cursor) + 1; at < siblings.length; at += 1) {
      const found = firstRendered(siblings[at]);
      if (found !== undefined) return found;
    }
    if (cursor.parent.dom !== undefined) return null;
    cursor = cursor.parent;
  }
  return null;
}

export function unplace(node: IDomNode): void {
  const rendered: Node[] = [];
  collectRendered(node, rendered);
  for (const dom of rendered) dom.parentNode?.removeChild(dom);
}

// Put a node's DOM where the logical tree says. Inserting an attached node moves it
export function place(node: IDomNode): void {
  const host = hostOf(node);
  if (host === undefined) {
    unplace(node);
    return;
  }
  const reference = nextRenderedAfter(node);
  const rendered: Node[] = [];
  collectRendered(node, rendered);
  for (const dom of rendered) host.insertBefore(dom, reference);
}
