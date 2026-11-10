import { descriptorToSolid } from '@symbiote-native/solid';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import type { ISymbioteNode } from '@symbiote-native/engine';

// A host node of `type` whose props follow `props`, with the component's own children inside it
export function hostNode(
  type: string,
  props: () => Record<string, unknown>,
  children?: () => JSX.Element,
): ISymbioteNode {
  return descriptorToSolid(
    () => ({ type, props: props(), children: [] }),
    children,
  );
}
