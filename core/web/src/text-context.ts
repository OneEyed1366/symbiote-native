// A text inside a text is a different view: the native commit walk renames it, and here it is a
// span rather than a block. The context is sticky down the tree, and only a plain view ends it

import {
  TEXT_COMPONENT,
  VIRTUAL_TEXT_COMPONENT,
} from '@symbiote-native/engine';
import type { IDomNode } from './dom-node';

const VIEW_COMPONENT = 'RCTView';

function isTextView(viewName: string): boolean {
  return viewName === TEXT_COMPONENT || viewName === VIRTUAL_TEXT_COMPONENT;
}

// What a node is rendered as, its authored name unless it sits inside a text
export function effectiveViewName(node: IDomNode): string {
  if (node.viewName === TEXT_COMPONENT && node.textContext) {
    return VIRTUAL_TEXT_COMPONENT;
  }
  return node.viewName;
}

// Whether the node's children sit inside a text
export function contextBelow(node: IDomNode): boolean {
  if (isTextView(node.viewName)) return true;
  return node.textContext && node.viewName !== VIEW_COMPONENT;
}

// Stops at a node whose context did not change, as everything under it was settled with it
export function syncTextContext(
  node: IDomNode,
  hasTextAncestor: boolean,
  onChanged: (node: IDomNode) => void,
): void {
  if (node.textContext === hasTextAncestor) return;
  node.textContext = hasTextAncestor;
  onChanged(node);
  const below = contextBelow(node);
  for (const child of node.children) syncTextContext(child, below, onChanged);
}
