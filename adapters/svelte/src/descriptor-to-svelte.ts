// Descriptor to engine-node bridge, the Svelte twin of `descriptorToReact` and `descriptorToVue`
// Shape-stable: each node is built once, then `update()` re-sets the bag and text by position
// A new node per call would recreate the native view and lose focus and `dispatchViewCommand` state

import { createDescriptorShapeGuard } from '@symbiote-native/components';
import type { IDescriptorChild } from '@symbiote-native/components';
import { textOf, type ISymbioteNode } from '@symbiote-native/engine';
import { setHostPropBag } from './element-props';
import symbioteRenderer from './symbiote-renderer';

type ICachedChild =
  | { readonly kind: 'text'; readonly node: ISymbioteNode }
  | {
      readonly kind: 'element';
      readonly node: ISymbioteNode;
      readonly type: string;
      readonly children: ICachedChild[];
    };

// A shape change throws instead of falling back, as every `render-*.ts` keeps one constant shape
const shape = createDescriptorShapeGuard('descriptorToSvelte');

function buildChild(child: IDescriptorChild): ICachedChild {
  if (typeof child === 'string') {
    return { kind: 'text', node: symbioteRenderer.createText(child) };
  }
  const node = symbioteRenderer.createElement(child.type);
  setHostPropBag(node, child.props);
  const children = child.children.map(grandchild => {
    const cached = buildChild(grandchild);
    symbioteRenderer.insert(node, cached.node, null);
    return cached;
  });
  return { kind: 'element', node, type: child.type, children };
}

function syncChild(cached: ICachedChild, child: IDescriptorChild): void {
  if (cached.kind === 'text') {
    const text = shape.asText(child);
    if (textOf(cached.node) !== text)
      symbioteRenderer.setText(cached.node, text);
    return;
  }
  const element = shape.asElement(child);
  shape.assertType(cached.type, element.type);
  setHostPropBag(cached.node, element.props);
  shape.assertChildCount(cached.children.length, element.children.length);
  cached.children.forEach((c, index) => syncChild(c, element.children[index]));
}

export type IDescriptorChildrenMount = {
  update(children: IDescriptorChild[]): void;
};

// Builds `descriptor.children` under `parent` once, then `update()` reuses the nodes by position
export function mountDescriptorChildren(
  parent: ISymbioteNode,
  children: IDescriptorChild[],
): IDescriptorChildrenMount {
  const cached = children.map(child => {
    const built = buildChild(child);
    symbioteRenderer.insert(parent, built.node, null);
    return built;
  });
  return {
    update(next: IDescriptorChild[]): void {
      shape.assertChildCount(cached.length, next.length);
      cached.forEach((c, index) => syncChild(c, next[index]));
    },
  };
}

// Mounts once when the root node is there, then updates, even for a root with no children
// Call it as `$effect(() => { syncChildren(hostNode, descriptor.children); })`
// Both arguments are read before any guard, or a guarded run drops them from tracking
export function createDescriptorChildrenSync(): (
  hostNode: ISymbioteNode | null,
  children: IDescriptorChild[],
) => void {
  let mounted: IDescriptorChildrenMount | undefined;
  return (hostNode, children) => {
    if (hostNode === null) return;
    if (mounted === undefined) {
      mounted = mountDescriptorChildren(hostNode, children);
    } else {
      mounted.update(children);
    }
  };
}
