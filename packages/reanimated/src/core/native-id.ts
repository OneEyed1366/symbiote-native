import { routeProp, type ISymbioteNode } from '@symbiote-native/engine';

const ids = new WeakMap<ISymbioteNode, number>();
let nextId = 0;

// Native finds the configs of a view before it has a tag by its `nativeID`, so a node keeps the one
// id for its entering animation and its shared transition alike
export function layoutConfigIdOf(node: ISymbioteNode): number {
  const known = ids.get(node);
  const id = known ?? nextId;
  if (known === undefined) {
    ids.set(node, id);
    nextId += 1;
  }
  routeProp(node, 'nativeID', String(id));
  return id;
}
