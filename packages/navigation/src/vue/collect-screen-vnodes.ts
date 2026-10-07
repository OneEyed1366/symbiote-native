// The screen markers of a navigator slot, flattened out of any `Fragment`

import { Fragment, isVNode } from '@vue/runtime-core';
import type { VNode } from '@vue/runtime-core';

// `v-for` in a slot yields a `Fragment` with the markers in its children, and a navigator that
// only looked at the top level would register none of them
export function collectScreenVnodes(
  vnodes: readonly VNode[],
  marker: VNode['type'],
): VNode[] {
  const found: VNode[] = [];
  for (const vnode of vnodes) {
    if (vnode.type === Fragment && Array.isArray(vnode.children))
      found.push(
        ...collectScreenVnodes(vnode.children.filter(isVNode), marker),
      );
    else if (vnode.type === marker) found.push(vnode);
  }
  return found;
}
