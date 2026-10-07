import type { JSX } from 'solid-js';
import { defineDescriptorComponent } from '@symbiote-native/solid';
import type { IViewProps } from '@symbiote-native/solid';
import type { IClassNameValue } from '@symbiote-native/engine';
import { renderLinearGradient } from '../core/linear-gradient';
import type { ILinearGradientProps as ILinearGradientBaseProps } from '../core/linear-gradient';

// Поверхность View как у `ViewProps` в upstream, дети и `class` свои у Solid
export type ILinearGradientProps = ILinearGradientBaseProps &
  Omit<IViewProps, keyof ILinearGradientBaseProps | 'children' | 'ref'> & {
    children?: JSX.Element;
    class?: IClassNameValue;
  };

/** Solid twin of `expo-linear-gradient`'s `LinearGradient`, children paint over the gradient */
export const LinearGradient =
  defineDescriptorComponent<ILinearGradientProps>(renderLinearGradient);
