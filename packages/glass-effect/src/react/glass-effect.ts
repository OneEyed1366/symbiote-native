import { createElement } from 'react';
import type { ReactElement, ReactNode, RefObject } from 'react';
import type { IHostInstance, IViewProps } from '@symbiote-native/react';
import { renderGlassContainer, renderGlassView } from '../core';
import type { IGlassContainerProps, IGlassViewProps } from '../core';

// Поверхность View как у `ViewProps` в upstream, дети и `className` свои у React
export type IGlassViewReactProps = IGlassViewProps &
  Omit<IViewProps, keyof IGlassViewProps | 'children' | 'ref'> & {
    ref?: RefObject<IHostInstance | null>;
    children?: ReactNode;
    className?: string;
  };

export type IGlassContainerReactProps = IGlassContainerProps &
  Omit<IViewProps, keyof IGlassContainerProps | 'children' | 'ref'> & {
    ref?: RefObject<IHostInstance | null>;
    children?: ReactNode;
    className?: string;
  };

/** React twin of `expo-glass-effect`'s `GlassView`, native on iOS and a plain View elsewhere */
export function GlassView(props: IGlassViewReactProps): ReactElement {
  const { children, ...rest } = props;
  const descriptor = renderGlassView(rest);
  return createElement(descriptor.type, descriptor.props, children);
}

/** React twin of `expo-glass-effect`'s `GlassContainer`, merges the glass views it holds */
export function GlassContainer(props: IGlassContainerReactProps): ReactElement {
  const { children, ...rest } = props;
  const descriptor = renderGlassContainer(rest);
  return createElement(descriptor.type, descriptor.props, children);
}
