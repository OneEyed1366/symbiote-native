import { h, type FunctionalComponent } from '@vue/runtime-core';
import {
  layoutAnimationScopeProps,
  type ILayoutAnimationScope,
} from '../core/layout-animation-scope';

export type ILayoutAnimationConfigProps = ILayoutAnimationScope;

export const LayoutAnimationConfig: FunctionalComponent<
  ILayoutAnimationConfigProps
> = (props, { slots }) =>
  h('view', layoutAnimationScopeProps(props), slots.default?.());

LayoutAnimationConfig.props = ['skipEntering', 'skipExiting'];
