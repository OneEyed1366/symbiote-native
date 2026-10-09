import { createElement, type ReactElement, type ReactNode } from 'react';

// `skipEntering` and `skipExiting` as upstream has them: the children neither animate in nor out
export type ILayoutAnimationConfigProps = {
  skipEntering?: boolean;
  skipExiting?: boolean;
  children?: ReactNode;
};

// A node of its own that takes no part in layout, so the engine can ask it about its children
const SCOPE_STYLE = { display: 'contents' };

export function LayoutAnimationConfig({
  skipEntering,
  skipExiting,
  children,
}: ILayoutAnimationConfigProps): ReactElement {
  return createElement(
    'view',
    {
      style: SCOPE_STYLE,
      layoutAnimationScope: { skipEntering, skipExiting },
    },
    children,
  );
}
