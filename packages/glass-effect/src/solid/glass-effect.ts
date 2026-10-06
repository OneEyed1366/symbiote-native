import type { JSX } from 'solid-js';
import { defineDescriptorComponent } from '@symbiote-native/solid';
import type { IViewProps } from '@symbiote-native/solid';
import type { IClassNameValue } from '@symbiote-native/engine';
import { renderGlassContainer, renderGlassView } from '../core';
import type { IGlassContainerProps, IGlassViewProps } from '../core';

// Поверхность View как у `ViewProps` в upstream, дети и `class` свои у Solid
export type IGlassViewSolidProps = IGlassViewProps &
  Omit<IViewProps, keyof IGlassViewProps | 'children'> & {
    children?: JSX.Element;
    class?: IClassNameValue;
  };

export type IGlassContainerSolidProps = IGlassContainerProps &
  Omit<IViewProps, keyof IGlassContainerProps | 'children'> & {
    children?: JSX.Element;
    class?: IClassNameValue;
  };

/** Solid twin of `expo-glass-effect`'s `GlassView`, native on iOS and a plain View elsewhere */
export const GlassView =
  defineDescriptorComponent<IGlassViewSolidProps>(renderGlassView);

/** Solid twin of `expo-glass-effect`'s `GlassContainer`, merges the glass views it holds */
export const GlassContainer =
  defineDescriptorComponent<IGlassContainerSolidProps>(renderGlassContainer);
