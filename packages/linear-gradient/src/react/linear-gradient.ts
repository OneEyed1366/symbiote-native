import type { ReactElement, ReactNode } from 'react';
import { descriptorToReactWithChildren } from '@symbiote-native/react';
import type { IViewProps } from '@symbiote-native/react';
import { renderLinearGradient } from '../core/linear-gradient';
import type { ILinearGradientProps as ILinearGradientBaseProps } from '../core/linear-gradient';

// Поверхность View как у `ViewProps` в upstream, дети и `className` свои у React
export type ILinearGradientProps = ILinearGradientBaseProps &
  Omit<IViewProps, keyof ILinearGradientBaseProps | 'children'> & {
    children?: ReactNode;
    className?: string;
  };

/** React twin of `expo-linear-gradient`'s `LinearGradient`, children paint over the gradient */
export function LinearGradient(props: ILinearGradientProps): ReactElement {
  const { children, ...rest } = props;
  return descriptorToReactWithChildren(renderLinearGradient(rest), children);
}
