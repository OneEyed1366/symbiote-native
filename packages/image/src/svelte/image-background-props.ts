import type { Snippet } from 'svelte';
import type { IViewProps } from '@symbiote-native/svelte';
import type { IImageBackgroundProps } from '../core';

export type IImageBackgroundSvelteProps = IImageBackgroundProps &
  Pick<IViewProps, 'class'> & {
    children?: Snippet;
  };
