import type { Snippet } from 'svelte';
import type { IImageBackgroundProps } from '../core';

export type IImageBackgroundSvelteProps = IImageBackgroundProps & {
  children?: Snippet;
};
