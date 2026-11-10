import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import type { ISymbioteNode } from '@symbiote-native/engine';
import {
  SHARED_TRANSITION_BOUNDARY_VIEW,
  sharedTransitionBoundaryProps,
} from '../core/shared-transition-boundary';
import { hostNode } from './host-node';

export type ISharedTransitionBoundaryProps = {
  isActive: boolean;
  children?: JSX.Element;
};

export function SharedTransitionBoundary(
  props: ISharedTransitionBoundaryProps,
): ISymbioteNode {
  return hostNode(
    SHARED_TRANSITION_BOUNDARY_VIEW,
    () => sharedTransitionBoundaryProps(props.isActive),
    () => props.children,
  );
}
