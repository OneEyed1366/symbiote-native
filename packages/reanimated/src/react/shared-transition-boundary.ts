import { createElement, type ReactElement, type ReactNode } from 'react';
import {
  SHARED_TRANSITION_BOUNDARY_VIEW,
  sharedTransitionBoundaryProps,
} from '../core/shared-transition-boundary';

export type ISharedTransitionBoundaryProps = {
  isActive: boolean;
  children?: ReactNode;
};

export function SharedTransitionBoundary({
  isActive,
  children,
}: ISharedTransitionBoundaryProps): ReactElement {
  return createElement(
    SHARED_TRANSITION_BOUNDARY_VIEW,
    sharedTransitionBoundaryProps(isActive),
    children,
  );
}
