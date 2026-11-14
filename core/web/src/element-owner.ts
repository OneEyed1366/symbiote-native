// Which logical node an element stands for, so an event on the page can be addressed to a node.
// Weak, so an element that leaves the page takes its entry with it

import type { IDomNode } from './dom-node';

const owners = new WeakMap<Node, IDomNode>();

export function setOwner(element: Node, node: IDomNode): void {
  owners.set(element, node);
}

// The nearest node at or above the target, as an event lands on the deepest element
export function ownerAt(target: Node | null): IDomNode | undefined {
  for (let current = target; current !== null; current = current.parentNode) {
    const owner = owners.get(current);
    if (owner !== undefined) return owner;
  }
  return undefined;
}
