import { isSymbioteNode } from '@symbiote-native/engine';
import { setHostPropBag } from './element-props';

// A dynamic tag (`<svelte:element this={...}>`) sets `p` as a plain attribute, which never reaches
// the engine, so the bag goes through an attachment that writes it on the raw element
export function hostProps(
  props: Record<string, unknown>,
): (node: unknown) => void {
  return node => {
    if (isSymbioteNode(node)) setHostPropBag(node, props);
  };
}
