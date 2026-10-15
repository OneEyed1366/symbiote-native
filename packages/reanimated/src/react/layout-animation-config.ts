import { createElement, type ReactElement, type ReactNode } from 'react';
import {
  layoutAnimationScopeProps,
  type ILayoutAnimationScope,
} from '../core/layout-animation-scope';

export type ILayoutAnimationConfigProps = ILayoutAnimationScope & {
  children?: ReactNode;
};

export function LayoutAnimationConfig({
  children,
  ...scope
}: ILayoutAnimationConfigProps): ReactElement {
  return createElement('view', layoutAnimationScopeProps(scope), children);
}
