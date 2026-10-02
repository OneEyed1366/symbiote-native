import { ShimElement } from './dom-shim';

// A dynamic tag (`<svelte:element this={...}>`) sets `p` as a plain attribute, which never reaches
// the engine, so the bag goes through an attachment that assigns the property on the raw element
export function hostProps(
  props: Record<string, unknown>,
): (node: unknown) => void {
  return node => {
    if (node instanceof ShimElement) node.p = props;
  };
}
