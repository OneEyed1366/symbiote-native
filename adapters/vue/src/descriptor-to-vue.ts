// The descriptor→element bridge for Vue. A render function in @symbiote-native/components returns
// a framework-agnostic `Descriptor` tree; this maps it onto Vue vnodes via h(). The host
// vnode (`view`, `activity-indicator`, …) flows on through the Vue custom
// renderer → engine → Fabric, exactly like a hand-written h('view'). The React
// twin is `adapters/react/src/descriptor-to-react.ts`.

import { h, type VNode } from '@vue/runtime-core';
import type {
  IDescriptor,
  IDescriptorChild,
} from '@symbiote-native/components';

// `extraChildren` are caller vnodes (a component's slot) that go after the descriptor's own
export function descriptorToVue(
  node: IDescriptor,
  extraChildren: readonly VNode[] = [],
): VNode {
  // String type → host element (the Vue renderer's createElement → descriptorFor maps it to
  // a Fabric name); array children, since these are host elements, not slotted components.
  return h(node.type, { ...node.props, key: node.key }, [
    ...node.children.map(toChild),
    ...extraChildren,
  ]);
}

function toChild(child: IDescriptorChild): VNode | string {
  return typeof child === 'string' ? child : descriptorToVue(child);
}
