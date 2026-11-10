import type { Component, Snippet } from 'svelte';

export type ISharedTransitionBoundaryProps = {
  isActive: boolean;
  children?: Snippet;
};

declare const SharedTransitionBoundary: Component<ISharedTransitionBoundaryProps>;
export default SharedTransitionBoundary;
