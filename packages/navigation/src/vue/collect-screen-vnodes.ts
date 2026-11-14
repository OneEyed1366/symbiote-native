// The screen markers of a navigator slot, flattened out of any `Fragment` or nested array

import { Fragment, isVNode } from '@vue/runtime-core';
import type { VNode } from '@vue/runtime-core';

// `v-for` yields a `Fragment`, and a JSX `{items.map(...)}` child stays a bare nested array
// because a compiled slot is not normalized, so both have to be walked for the markers
export function collectScreenVnodes(
  nodes: readonly unknown[],
  marker: VNode['type'],
): VNode[] {
  const found: VNode[] = [];
  for (const node of nodes) {
    if (Array.isArray(node)) found.push(...collectScreenVnodes(node, marker));
    else if (!isVNode(node)) continue;
    else if (node.type === Fragment && Array.isArray(node.children))
      found.push(...collectScreenVnodes(node.children, marker));
    else if (node.type === marker) found.push(node);
  }
  return found;
}
