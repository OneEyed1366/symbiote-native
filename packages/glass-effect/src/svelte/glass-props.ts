import type { Snippet } from 'svelte';
import type { IViewProps } from '@symbiote-native/svelte';
import type { IGlassContainerProps, IGlassViewProps } from '../core';

// Поверхность View как у `ViewProps` в upstream, дети идут сниппетом
export type IGlassViewSvelteProps = IGlassViewProps &
  Omit<IViewProps, keyof IGlassViewProps | 'children'> & {
    /** Host-ref через `bind:ref` */
    ref?: unknown;
    children?: Snippet;
  };

export type IGlassContainerSvelteProps = IGlassContainerProps &
  Omit<IViewProps, keyof IGlassContainerProps | 'children'> & {
    /** Host-ref через `bind:ref` */
    ref?: unknown;
    children?: Snippet;
  };
