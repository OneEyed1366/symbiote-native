// Vue's dev build hangs `__vnode` and `__vueParentComponent` on every element it mounts
// A link from a child to its parent component keeps a removed screen alive via `attachedHandle`

import { childrenOf, type ISymbioteNode } from '@symbiote-native/engine';

declare const process: { env: { NODE_ENV?: string } };

// Walks the removed subtree, so it costs one engine read per node and runs in dev builds only
// The condition is Vue's own, which the bundler inlines
export function dropDevLinks(node: ISymbioteNode): void {
  if (process.env.NODE_ENV === 'production') return;
  Reflect.deleteProperty(node, '__vnode');
  Reflect.deleteProperty(node, '__vueParentComponent');
  for (const child of childrenOf(node)) dropDevLinks(child);
}
