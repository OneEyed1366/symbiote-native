// A shape-CHANGE-tolerant wrapper over @symbiote-native/svelte's Descriptor bridge.
//
// `mountDescriptorChildren` (svelte-adapter-custom-renderer skill §5) is deliberately
// shape-stable: it builds each node once and only re-sets props thereafter, throwing if the tree
// shape ever changes, because every `core/components` render-*.ts produces a constant shape. The
// navigation package's tab bar is the exception - `renderTabBar` emits one child per registered
// route, and that count genuinely varies (it is 0 until the `<Tab.Screen>` markers have
// registered, and changes again if a screen is added or removed). Same situation
// @symbiote-native/slider's own steps-indicator overlay is in, and the same resolution: keep the
// fast path for the common "same shape, new prop values" case and rebuild only when the shape
// actually changed.
//
// The shape signature covers types and nesting, not just the top-level count, because a tab bar
// item's own children vary too (an item gains an icon wrapper only when it has an icon or badge).

import { mountDescriptorChildren } from '@symbiote-native/svelte/native-view-bridge';
import type { IDescriptorChildrenMount } from '@symbiote-native/svelte/native-view-bridge';
import { removeChild } from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
import type { IDescriptorChild } from '@symbiote-native/components';

const TEXT_CHILD_MARK = '#';

function shapeOf(children: readonly IDescriptorChild[]): string {
  return children
    .map(child =>
      typeof child === 'string' ? TEXT_CHILD_MARK : `${child.type}(${shapeOf(child.children)})`,
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
      for (const child of host.children.slice()) removeChild(host, child);
      mounted = mountDescriptorChildren(host, children);
      shape = nextShape;
      return;
    }
    mounted.update(children);
  };
}
