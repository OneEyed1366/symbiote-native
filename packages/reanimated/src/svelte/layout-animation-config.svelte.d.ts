import type { Component, Snippet } from 'svelte';
import type { ILayoutAnimationScope } from '../core/layout-animation-scope';

export type ILayoutAnimationConfigProps = ILayoutAnimationScope & {
  children?: Snippet;
};

declare const LayoutAnimationConfig: Component<ILayoutAnimationConfigProps>;
export default LayoutAnimationConfig;
