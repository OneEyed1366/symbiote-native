// The host element a list renders: the scroll tag, or a plain view when it is nested in a list

import {
  createElement,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import type { ISymbioteNode } from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
  IListNesting,
} from '@symbiote-native/components';
import type { IListConfig } from './list-config';
import { refreshControlOf, type IScrollTagProps } from './list-scroll-props';
import { VirtualizedListScopeProvider } from './nested-scope';

export type IListHostArgs<ItemT> = {
  config: IListConfig<ItemT>;
  nesting: IListNesting<ItemT>;
  scrollProps: IScrollTagProps;
  accessibilityRest: IAccessibilityProps & IAriaProps;
  nodeRef: RefObject<ISymbioteNode | null>;
  children: ReactNode[];
};

// The scroll TAG, not a wrapper: the engine builds the content node, `ref` hands back the engine
// node that `buildScrollViewHandle` drives
function scrollTagOf<ItemT>(args: IListHostArgs<ItemT>): ReactElement {
  const { config, scrollProps, nodeRef, children } = args;
  return createElement(
    config.horizontal ? 'horizontal-scroll-view' : 'scroll-view',
    { ...scrollProps, ref: nodeRef },
    refreshControlOf(config),
    ...children,
  );
}

// The list above scrolls, so RN renders a `View` with no content container
function nestedViewOf<ItemT>(args: IListHostArgs<ItemT>): ReactElement {
  const { scrollProps, accessibilityRest, nodeRef, children } = args;
  return createElement(
    'view',
    {
      ...accessibilityRest,
      style: scrollProps.style,
      onLayout: scrollProps.onLayout,
      ref: nodeRef,
    },
    ...children,
  );
}

export function listHostOf<ItemT>(args: IListHostArgs<ItemT>): ReactElement {
  const { nesting } = args;
  return createElement(
    VirtualizedListScopeProvider,
    { scope: nesting.scope },
    nesting.isNested ? nestedViewOf(args) : scrollTagOf(args),
  );
}
