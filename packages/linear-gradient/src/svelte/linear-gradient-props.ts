import type { Snippet } from 'svelte';
import type { IViewProps } from '@symbiote-native/svelte';
import type { ILinearGradientProps as ILinearGradientBaseProps } from '../core/linear-gradient';

// Поверхность View как у `ViewProps` в upstream, дети идут сниппетом
export type ILinearGradientProps = ILinearGradientBaseProps &
  Omit<IViewProps, keyof ILinearGradientBaseProps | 'children'> & {
    children?: Snippet;
  };
