import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import type { ISymbioteNode } from '@symbiote-native/engine';
import {
  layoutAnimationScopeProps,
  type ILayoutAnimationScope,
} from '../core/layout-animation-scope';
import { hostNode } from './host-node';

export type ILayoutAnimationConfigProps = ILayoutAnimationScope & {
  children?: JSX.Element;
};

export function LayoutAnimationConfig(
  props: ILayoutAnimationConfigProps,
): ISymbioteNode {
  return hostNode(
    'view',
    () => layoutAnimationScopeProps(props),
    () => props.children,
  );
}
