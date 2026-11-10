import { h, type FunctionalComponent } from '@vue/runtime-core';
import {
  SHARED_TRANSITION_BOUNDARY_VIEW,
  sharedTransitionBoundaryProps,
} from '../core/shared-transition-boundary';

export type ISharedTransitionBoundaryProps = { isActive: boolean };

export const SharedTransitionBoundary: FunctionalComponent<
  ISharedTransitionBoundaryProps
> = (props, { slots }) =>
  h(
    SHARED_TRANSITION_BOUNDARY_VIEW,
    sharedTransitionBoundaryProps(props.isActive),
    slots.default?.(),
  );

SharedTransitionBoundary.props = ['isActive'];
