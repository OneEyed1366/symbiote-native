import type { Snippet } from 'svelte';
import type { IViewProps } from '@symbiote-native/svelte';
import type { IBlurTargetViewProps, IBlurViewProps } from '../core';

// Поверхность View как у `ViewProps` в upstream, дети идут сниппетом
export type IBlurViewSvelteProps = IBlurViewProps &
  Omit<IViewProps, keyof IBlurViewProps | 'children'> & {
    /** Значение `bind:ref` от `BlurTargetView`, его содержимое это фон для размытия */
    blurTarget?: unknown;
    children?: Snippet;
  };

export type IBlurTargetViewSvelteProps = IBlurTargetViewProps &
  Omit<IViewProps, keyof IBlurTargetViewProps | 'children'> & {
    /** Host-ref, отдаётся через `bind:ref` и передаётся в `blurTarget` у `BlurView` */
    ref?: unknown;
    children?: Snippet;
  };
