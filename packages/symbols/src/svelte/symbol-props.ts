import type { Snippet } from 'svelte';
import type { IViewProps } from '@symbiote-native/svelte';
import type { ISymbolViewProps } from '../core';

// Поверхность View как у `ViewProps` в upstream, запасной вариант идёт сниппетом `fallback`
export type ISymbolViewSvelteProps = ISymbolViewProps &
  Omit<IViewProps, keyof ISymbolViewProps | 'children'> & {
    /** Rendered when a symbol for the current platform is not defined */
    fallback?: Snippet;
  };
