import { Fragment, createElement, useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { descriptorToReact } from '@symbiote-native/react';
import type { IViewProps } from '@symbiote-native/react';
import { renderSymbolView, watchSymbolFont } from '../core';
import type { ISymbolViewProps } from '../core';

// Поверхность View как у `ViewProps` в upstream, `fallback` и `className` свои у React
export type ISymbolViewReactProps = ISymbolViewProps &
  Omit<IViewProps, keyof ISymbolViewProps | 'children'> & {
    /** Rendered when a symbol for the current platform is not defined */
    fallback?: ReactNode;
    className?: string;
  };

/** React twin of `expo-symbols`' `SymbolView`, SF Symbols on iOS and Material Symbols elsewhere */
export function SymbolView(props: ISymbolViewReactProps): ReactElement {
  const { fallback, ...rest } = props;
  const [isFontLoaded, setIsFontLoaded] = useState(false);

  // Шрифт грузится один раз при монтировании, как в upstream, смена веса его не перезагружает
  useEffect(() => watchSymbolFont(rest, setIsFontLoaded), []);

  const descriptor = renderSymbolView(rest, isFontLoaded);
  if (!descriptor) return createElement(Fragment, null, fallback);
  return createElement(
    descriptor.type,
    descriptor.props,
    ...descriptor.children.map(child =>
      typeof child === 'string' ? child : descriptorToReact(child),
    ),
  );
}
