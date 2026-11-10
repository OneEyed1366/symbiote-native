// `Stack.Screen` is a marker that is never rendered, `Stack` reads its props through `Children`
// They build the registry of name to component and options, and `Stack` mounts each pushed route

import type { FC, ReactElement, ReactNode, RefObject } from 'react';
import type { IRoute } from '../core';
import type {
  ISearchBarCommands,
  ISearchBarOptions,
  IScreenOptions,
} from '../core';
import type { INavigatorHandle } from '../core';

// The imperative `ref` carries a React type, so it cannot sit in the shared `ISearchBarOptions`
// This overlay adds it to the agnostic base, as the screens `SearchBarProps.ref` does
export type IReactSearchBarOptions = ISearchBarOptions & {
  ref?: RefObject<ISearchBarCommands | null>;
};

export type IReactScreenOptions = Omit<
  IScreenOptions,
  'headerSearchBarOptions'
> & {
  headerSearchBarOptions?: IReactSearchBarOptions;
  headerLeft?: () => ReactNode;
  headerRight?: () => ReactNode;
  headerTitle?: () => ReactNode;
  sheetFooter?: () => ReactNode;
};

// The resolver runs inside `Stack` while it computes options, so bar button handlers close over it
// It is a config callback with no lifecycle, so hooks are unavailable and the handle is an argument
export type IScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: INavigatorHandle;
};

export type IScreenOptionsResolver = (
  args: IScreenOptionsArgs,
) => IReactScreenOptions;

export type IScreenProps = {
  name: string;
  component: FC;
  options?: IReactScreenOptions | IScreenOptionsResolver;
  initialParams?: unknown;
};

export function Screen(_props: IScreenProps): ReactElement | null {
  return null;
}
