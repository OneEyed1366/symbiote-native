import { createElement, type ReactElement, type ReactNode } from 'react';
import REASharedTransitionBoundary from 'react-native-reanimated/src/specs/SharedTransitionBoundaryNativeComponent';

export type ISharedTransitionBoundaryProps = {
  isActive: boolean;
  children?: ReactNode;
};

const CONTENTS_STYLE = { overflow: 'visible', display: 'contents' } as const;

// The spec import registers the view config the engine derives its props from
export function SharedTransitionBoundary({
  isActive,
  children,
}: ISharedTransitionBoundaryProps): ReactElement {
  return createElement(
    REASharedTransitionBoundary,
    { style: CONTENTS_STYLE, isActive, pointerEvents: 'box-none' },
    children,
  );
}
