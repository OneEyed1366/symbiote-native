// A wrapper over the Descriptor bridge of `@symbiote-native/svelte` that tolerates a shape change
// `mountDescriptorChildren` is shape-stable: it builds each node once and only re-sets props after

// `renderTabBar` is the exception, as it emits one child per registered route, so the count
// varies: 0 until the `<Tab.Screen>` markers register, then again when a screen is added or removed
// The fast path stays for same-shape updates, and the tree is rebuilt only on a shape change
//
// The shape signature covers types and nesting, not just the top-level count, because a tab bar
// item's own children vary too (an item gains an icon wrapper only when it has an icon or badge).

import {
  childrenOf,
  removeChild,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { mountDescriptorChildren } from '@symbiote-native/svelte/native-view-bridge';
import type { IDescriptorChildrenMount } from '@symbiote-native/svelte/native-view-bridge';
import type { IDescriptorChild } from '@symbiote-native/components';

const TEXT_CHILD_MARK = '#';

function shapeOf(children: readonly IDescriptorChild[]): string {
  return children
    .map(child =>
      typeof child === 'string'
        ? TEXT_CHILD_MARK
        : `${child.type}(${shapeOf(child.children)})`,
    )
    .join(',');
}

export function createDescriptorSubtreeSync(): (
  host: ISymbioteNode | null,
  children: IDescriptorChild[],
) => void {
  let mounted: IDescriptorChildrenMount | undefined;
  let shape: string | undefined;
  return (host, children) => {
    if (host === null) return;
    const nextShape = shapeOf(children);
    if (mounted === undefined || nextShape !== shape) {
      for (const child of childrenOf(host).slice()) removeChild(host, child);
      mounted = mountDescriptorChildren(host, children);
      shape = nextShape;
      return;
    }
    mounted.update(children);
  };
}
